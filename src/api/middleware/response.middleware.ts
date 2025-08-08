import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, ApiResponse, PaginatedResponse } from '../types/api.types';
import { logger } from '../../utils/logger';

export class ResponseMiddleware {
  /**
   * Add common response helpers to response object
   */
  enhanceResponse = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to add metadata
    res.json = function(body: any) {
      const executionTime = Date.now() - startTime;
      
      // If body is already an ApiResponse, just add execution time
      if (body && typeof body === 'object' && body.hasOwnProperty('success')) {
        body.metadata = {
          ...body.metadata,
          executionTime,
        };
      }
      
      return originalJson.call(this, body);
    };
    
    // Add success response helper
    res.success = function(data?: any, metadata?: any): Response {
      const response: ApiResponse = {
        success: true,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          executionTime: Date.now() - startTime,
          ...metadata,
        },
      };
      
      return this.json(response);
    };
    
    // Add paginated response helper
    res.paginated = function(
      data: any[],
      currentPage: number,
      totalItems: number,
      itemsPerPage: number,
      metadata?: any
    ): Response {
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      const hasNext = currentPage < totalPages;
      const hasPrev = currentPage > 1;
      
      const response: PaginatedResponse = {
        success: true,
        data,
        pagination: {
          currentPage,
          totalPages,
          totalItems,
          itemsPerPage,
          hasNext,
          hasPrev,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          executionTime: Date.now() - startTime,
          ...metadata,
        },
      };
      
      return this.json(response);
    };
    
    // Add error response helper
    res.error = function(
      code: string,
      message: string,
      statusCode: number = 500,
      details?: any
    ): Response {
      const response: ApiResponse = {
        success: false,
        error: {
          code,
          message,
          details,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          executionTime: Date.now() - startTime,
        },
      };
      
      return this.status(statusCode).json(response);
    };
    
    next();
  };
  
  /**
   * Add security headers
   */
  addSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
    // Security headers
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    
    // API-specific headers
    res.set({
      'X-API-Version': '1.0.0',
      'X-Response-Time': '0',
    });
    
    next();
  };
  
  /**
   * Add CORS headers for API
   */
  addCorsHeaders = (req: Request, res: Response, next: NextFunction): void => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    const origin = req.get('Origin');
    
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      res.set({
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400', // 24 hours
      });
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    next();
  };
  
  /**
   * Request logging middleware
   */
  logRequests = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    
    // Log request
    logger.info('API Request', {
      method: req.method,
      url: req.url,
      ip: this.getClientIp(req),
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
    });
    
    // Override end method to log response
    const originalEnd = res.end;
    res.end = function(chunk: any, encoding?: any) {
      const executionTime = Date.now() - startTime;
      
      logger.info('API Response', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        executionTime,
        userId: req.user?.id,
        contentLength: res.get('Content-Length'),
      });
      
      // Update response time header
      res.set('X-Response-Time', `${executionTime}ms`);
      
      return originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
  
  /**
   * Add request ID for tracing
   */
  addRequestId = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const requestId = this.generateRequestId();
    
    // Add to request for use in logging
    (req as any).requestId = requestId;
    
    // Add to response headers
    res.set('X-Request-ID', requestId);
    
    next();
  };
  
  /**
   * Compression response
   */
  conditionalCompression = (req: Request, res: Response, next: NextFunction): void => {
    // Skip compression for small responses or specific content types
    const originalJson = res.json;
    
    res.json = function(body: any) {
      const bodyString = JSON.stringify(body);
      
      // Only compress if response is large enough and client accepts it
      if (bodyString.length > 1024 && req.accepts('gzip')) {
        res.set('Content-Encoding', 'gzip');
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
  
  /**
   * Cache control headers
   */
  setCacheControl = (maxAge: number = 0, isPrivate: boolean = true) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (maxAge > 0) {
        const cacheControl = isPrivate 
          ? `private, max-age=${maxAge}`
          : `public, max-age=${maxAge}`;
        
        res.set('Cache-Control', cacheControl);
        
        if (!isPrivate) {
          // Add ETag for public cache
          const etag = this.generateETag(req.url);
          res.set('ETag', etag);
        }
      } else {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      }
      
      next();
    };
  };
  
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
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Generate ETag for caching
   */
  private generateETag(content: string): string {
    // Simple hash-based ETag
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `"${Math.abs(hash).toString(36)}"`;
  }
}

// Extend Express Response interface
declare global {
  namespace Express {
    interface Response {
      success(data?: any, metadata?: any): Response;
      paginated(
        data: any[],
        currentPage: number,
        totalItems: number,
        itemsPerPage: number,
        metadata?: any
      ): Response;
      error(
        code: string,
        message: string,
        statusCode?: number,
        details?: any
      ): Response;
    }
  }
}

// Export singleton instance
export const responseMiddleware = new ResponseMiddleware();