import { Request, Response, NextFunction } from 'express';
import { RateLimiter } from '../../utils/rate-limiter';
import { AuthenticatedRequest, RateLimitConfig, ErrorCodes } from '../types/api.types';
import { logger } from '../../utils/logger';
import { vercelKV } from '../../database/vercel-kv';

export class RateLimitMiddleware {
  private rateLimiters = new Map<string, RateLimiter>();
  
  /**
   * Create rate limiting middleware
   */
  create(config: RateLimitConfig) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Skip rate limiting if condition is met
        if (config.skipIf && config.skipIf(req)) {
          next();
          return;
        }
        
        // Generate key for this client/endpoint
        const key = config.keyGenerator ? 
          config.keyGenerator(req) : 
          this.defaultKeyGenerator(req);
        
        // Use Vercel KV for distributed rate limiting if available
        if (vercelKV.isReady()) {
          const windowSeconds = Math.floor(config.windowMs / 1000);
          const rateLimitResult = await vercelKV.incrementRateLimit(key, windowSeconds);
          
          if (rateLimitResult.count <= config.maxRequests) {
            // Request allowed
            const remaining = Math.max(0, config.maxRequests - rateLimitResult.count);
            const resetTime = Math.ceil(rateLimitResult.resetTime / 1000);
            
            res.set({
              'X-RateLimit-Limit': config.maxRequests.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': resetTime.toString(),
              'X-RateLimit-Window': config.windowMs.toString(),
            });
            
            next();
            return;
          } else {
            // Rate limit exceeded
            const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
            
            logger.warn('Rate limit exceeded (KV)', {
              key,
              count: rateLimitResult.count,
              maxRequests: config.maxRequests,
              windowMs: config.windowMs,
              retryAfter,
              userAgent: req.get('User-Agent'),
              ip: this.getClientIp(req),
            });
            
            res.set({
              'X-RateLimit-Limit': config.maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString(),
              'Retry-After': retryAfter.toString(),
            });
            
            res.status(429).json({
              success: false,
              error: {
                code: ErrorCodes.RATE_LIMITED,
                message: 'Too many requests. Please try again later.',
                details: {
                  retryAfter: retryAfter,
                  limit: config.maxRequests,
                  window: config.windowMs,
                },
              },
              metadata: {
                timestamp: new Date().toISOString(),
                version: '1.0.0',
              },
            });
            return;
          }
        }
        
        // Fallback to in-memory rate limiting
        if (!this.rateLimiters.has(key)) {
          this.rateLimiters.set(key, new RateLimiter({
            maxRequests: config.maxRequests,
            windowMs: config.windowMs,
          }));
        }
        
        const limiter = this.rateLimiters.get(key)!;
        
        // Try to acquire request
        if (await limiter.tryAcquire()) {
          // Add rate limit headers
          const remaining = await limiter.getRemaining();
          const resetTime = limiter.getResetTime();
          
          res.set({
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
            'X-RateLimit-Window': config.windowMs.toString(),
          });
          
          next();
        } else {
          // Rate limit exceeded
          const resetTime = limiter.getResetTime();
          const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
          
          logger.warn('Rate limit exceeded (memory)', {
            key,
            maxRequests: config.maxRequests,
            windowMs: config.windowMs,
            retryAfter,
            userAgent: req.get('User-Agent'),
            ip: this.getClientIp(req),
          });
          
          res.set({
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
            'Retry-After': retryAfter.toString(),
          });
          
          res.status(429).json({
            success: false,
            error: {
              code: ErrorCodes.RATE_LIMITED,
              message: 'Too many requests. Please try again later.',
              details: {
                retryAfter: retryAfter,
                limit: config.maxRequests,
                window: config.windowMs,
              },
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: '1.0.0',
            },
          });
        }
        
      } catch (error: any) {
        logger.error('Rate limiting error', {
          error: error.message,
          stack: error.stack,
        });
        
        // Continue on error (fail open)
        next();
      }
    };
  }
  
  /**
   * Create per-user rate limiter
   */
  perUser(maxRequests: number, windowMs: number = 60000) {
    return this.create({
      maxRequests,
      windowMs,
      keyGenerator: (req: AuthenticatedRequest) => {
        return `user:${req.user?.id || this.getClientIp(req)}`;
      },
      skipIf: (req: AuthenticatedRequest) => {
        // Skip rate limiting for admin users
        return req.user?.role === 'admin';
      },
    });
  }
  
  /**
   * Create per-IP rate limiter
   */
  perIp(maxRequests: number, windowMs: number = 60000) {
    return this.create({
      maxRequests,
      windowMs,
      keyGenerator: (req: Request) => {
        return `ip:${this.getClientIp(req)}`;
      },
    });
  }
  
  /**
   * Create per-API-key rate limiter
   */
  perApiKey(maxRequests: number, windowMs: number = 60000) {
    return this.create({
      maxRequests,
      windowMs,
      keyGenerator: (req: Request) => {
        const apiKey = req.get('X-API-Key');
        return `api-key:${apiKey || this.getClientIp(req)}`;
      },
    });
  }
  
  /**
   * Create global rate limiter
   */
  global(maxRequests: number, windowMs: number = 60000) {
    return this.create({
      maxRequests,
      windowMs,
      keyGenerator: () => 'global',
    });
  }
  
  /**
   * Create endpoint-specific rate limiter
   */
  perEndpoint(maxRequests: number, windowMs: number = 60000) {
    return this.create({
      maxRequests,
      windowMs,
      keyGenerator: (req: AuthenticatedRequest) => {
        const userId = req.user?.id || this.getClientIp(req);
        return `endpoint:${req.path}:${userId}`;
      },
    });
  }
  
  /**
   * Default key generator
   */
  private defaultKeyGenerator(req: AuthenticatedRequest): string {
    if (req.user) {
      return `user:${req.user.id}`;
    }
    
    return `ip:${this.getClientIp(req)}`;
  }
  
  /**
   * Get client IP address
   */
  private getClientIp(req: Request): string {
    return (
      req.get('X-Forwarded-For') ||
      req.get('X-Real-IP') ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
  
  /**
   * Clear rate limiters (for testing)
   */
  clearAll(): void {
    this.rateLimiters.clear();
  }
  
  /**
   * Get current statistics
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [key, limiter] of this.rateLimiters.entries()) {
      stats[key] = {
        remaining: limiter.getRemaining(),
        resetTime: limiter.getResetTime(),
        isLimited: !limiter.canAcquire(),
      };
    }
    
    return stats;
  }
}

// Export singleton instance
export const rateLimitMiddleware = new RateLimitMiddleware();