import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, AuthUser, ApiError, ErrorCodes } from '../types/api.types';
import { logger } from '../../utils/logger';
import { vercelKV } from '../../database/vercel-kv';

export class AuthMiddleware {
  private readonly jwtSecret: string;
  
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'development-secret-change-in-production';
    
    if (process.env.NODE_ENV === 'production' && this.jwtSecret === 'development-secret-change-in-production') {
      throw new Error('JWT_SECRET must be set in production environment');
    }
  }
  
  /**
   * Verify JWT token and attach user to request
   */
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.header('Authorization');
      
      if (!authHeader) {
        this.sendUnauthorized(res, 'Authorization header is required');
        return;
      }
      
      const token = this.extractToken(authHeader);
      if (!token) {
        this.sendUnauthorized(res, 'Invalid authorization format. Use: Bearer <token>');
        return;
      }
      
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      if (!decoded || !decoded.sub) {
        this.sendUnauthorized(res, 'Invalid token payload');
        return;
      }
      
      // Check if token is blacklisted (for logout/security)
      const tokenId = decoded.jti || decoded.sub + '_' + decoded.iat;
      if (vercelKV.isReady()) {
        const isBlacklisted = await vercelKV.isTokenBlacklisted(tokenId);
        if (isBlacklisted) {
          this.sendUnauthorized(res, 'Token has been revoked', ErrorCodes.TOKEN_REVOKED);
          return;
        }
      }
      
      // Create user object from token
      const user: AuthUser = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role || 'readonly',
        permissions: decoded.permissions || [],
        clientIds: decoded.clientIds,
      };
      
      // Attach user to request
      req.user = user;
      
      logger.debug('User authenticated successfully', {
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      
      next();
      
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        this.sendUnauthorized(res, 'Token has expired', ErrorCodes.TOKEN_EXPIRED);
      } else if (error.name === 'JsonWebTokenError') {
        this.sendUnauthorized(res, 'Invalid token', ErrorCodes.INVALID_TOKEN);
      } else {
        logger.error('Authentication error', {
          error: error.message,
          stack: error.stack,
        });
        this.sendUnauthorized(res, 'Authentication failed');
      }
    }
  };
  
  /**
   * Optional authentication - sets user if token is valid, continues if not
   */
  optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.header('Authorization');
      
      if (!authHeader) {
        next();
        return;
      }
      
      const token = this.extractToken(authHeader);
      if (!token) {
        next();
        return;
      }
      
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      if (decoded && decoded.sub) {
        const user: AuthUser = {
          id: decoded.sub,
          email: decoded.email,
          role: decoded.role || 'readonly',
          permissions: decoded.permissions || [],
          clientIds: decoded.clientIds,
        };
        
        req.user = user;
      }
      
      next();
      
    } catch (error) {
      // Continue without authentication if token is invalid
      next();
    }
  };
  
  /**
   * Require specific role
   */
  requireRole = (requiredRole: AuthUser['role'] | AuthUser['role'][]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        this.sendUnauthorized(res, 'Authentication required');
        return;
      }
      
      const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      
      if (!roles.includes(req.user.role)) {
        this.sendForbidden(res, `Required role: ${roles.join(' or ')}`);
        return;
      }
      
      next();
    };
  };
  
  /**
   * Require specific permission
   */
  requirePermission = (permission: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        this.sendUnauthorized(res, 'Authentication required');
        return;
      }
      
      if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
        this.sendForbidden(res, `Required permission: ${permission}`);
        return;
      }
      
      next();
    };
  };
  
  /**
   * Check if user can access specific client data
   */
  requireClientAccess = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      this.sendUnauthorized(res, 'Authentication required');
      return;
    }
    
    // Admin can access all clients
    if (req.user.role === 'admin') {
      next();
      return;
    }
    
    // Get client ID from route params or query
    const clientId = parseInt(req.params.clientId || req.query.clientId as string);
    
    if (!clientId) {
      this.sendForbidden(res, 'Client ID is required');
      return;
    }
    
    // Check if user has access to this client
    if (!req.user.clientIds || !req.user.clientIds.includes(clientId)) {
      this.sendForbidden(res, 'Access denied to this client');
      return;
    }
    
    next();
  };
  
  /**
   * Generate JWT token
   */
  generateToken(user: Partial<AuthUser> & { id: string }): string {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + (24 * 60 * 60); // 24 hours
    const jti = `${user.id}_${iat}`; // Unique token ID for blacklisting
    
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      clientIds: user.clientIds,
      iat,
      exp,
      jti,
    };
    
    return jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
  }
  
  /**
   * Blacklist a token (for logout or security)
   */
  async blacklistToken(token: string): Promise<void> {
    if (!vercelKV.isReady()) {
      logger.warn('Cannot blacklist token - Vercel KV not available');
      return;
    }
    
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const tokenId = decoded.jti || decoded.sub + '_' + decoded.iat;
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      
      if (ttl > 0) {
        await vercelKV.blacklistToken(tokenId, ttl);
        logger.info('Token blacklisted', { tokenId, ttl });
      }
    } catch (error: any) {
      logger.error('Failed to blacklist token', {
        error: error.message,
      });
    }
  }
  
  /**
   * Extract token from Authorization header
   */
  private extractToken(authHeader: string): string | null {
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }
  
  /**
   * Send unauthorized response
   */
  private sendUnauthorized(res: Response, message: string, code: string = ErrorCodes.UNAUTHORIZED): void {
    res.status(401).json({
      success: false,
      error: {
        code,
        message,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  }
  
  /**
   * Send forbidden response
   */
  private sendForbidden(res: Response, message: string): void {
    res.status(403).json({
      success: false,
      error: {
        code: ErrorCodes.FORBIDDEN,
        message,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  }
}

// Export singleton instance
export const authMiddleware = new AuthMiddleware();