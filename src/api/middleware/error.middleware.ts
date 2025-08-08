import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AuthenticatedRequest, ApiResponse, ErrorCodes } from '../types/api.types';
import { logger } from '../../utils/logger';

export class ErrorMiddleware {
  /**
   * Global error handler middleware
   */
  handle = (error: any, req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    
    try {
      // Log the error
      logger.error('API Error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        userId: req.user?.id,
        userAgent: req.get('User-Agent'),
        ip: this.getClientIp(req),
      });
      
      let statusCode = 500;
      let errorCode = ErrorCodes.INTERNAL_ERROR;
      let message = 'Internal server error';
      let details: any = undefined;
      
      // Handle different types of errors
      if (error instanceof ZodError) {
        // Validation errors
        statusCode = 400;
        errorCode = ErrorCodes.VALIDATION_ERROR;
        message = 'Validation failed';
        details = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        
      } else if (error.name === 'UnauthorizedError') {
        // JWT/Auth errors
        statusCode = 401;
        errorCode = ErrorCodes.UNAUTHORIZED;
        message = error.message || 'Unauthorized';
        
      } else if (error.code === 'SQLITE_CONSTRAINT') {
        // Database constraint errors
        statusCode = 400;
        errorCode = ErrorCodes.VALIDATION_ERROR;
        message = 'Data constraint violation';
        
        if (error.message.includes('UNIQUE constraint failed')) {
          message = 'Resource already exists';
          errorCode = ErrorCodes.RESOURCE_EXISTS;
        }
        
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        // Network/external service errors
        statusCode = 503;
        errorCode = ErrorCodes.SERVICE_UNAVAILABLE;
        message = 'External service unavailable';
        
      } else if (error.statusCode) {
        // Custom API errors
        statusCode = error.statusCode;
        errorCode = error.code || ErrorCodes.INTERNAL_ERROR;
        message = error.message;
        details = error.details;
        
      } else if (error.message) {
        // Generic errors with message
        message = error.message;
        
        // Try to determine appropriate status code from message
        if (error.message.includes('not found')) {
          statusCode = 404;
          errorCode = ErrorCodes.NOT_FOUND;
        } else if (error.message.includes('forbidden') || error.message.includes('access denied')) {
          statusCode = 403;
          errorCode = ErrorCodes.FORBIDDEN;
        } else if (error.message.includes('unauthorized')) {
          statusCode = 401;
          errorCode = ErrorCodes.UNAUTHORIZED;
        }
      }
      
      // Don't expose internal errors in production
      if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
        message = 'Internal server error';
        details = undefined;
      }
      
      const executionTime = Date.now() - startTime;
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: errorCode,
          message,
          details,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          executionTime,
        },
      };
      
      res.status(statusCode).json(response);
      
    } catch (handlerError: any) {
      // Fallback error handling
      logger.error('Error handler failed', {
        originalError: error.message,
        handlerError: handlerError.message,
        stack: handlerError.stack,
      });
      
      res.status(500).json({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'Critical system error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
        },
      });
    }
  };
  
  /**
   * 404 Not Found handler
   */
  notFound = (req: Request, res: Response): void => {
    res.status(404).json({
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: `Route ${req.method} ${req.path} not found`,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  };
  
  /**
   * Async error wrapper
   */
  asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };
  
  /**
   * Validation error helper
   */
  createValidationError(field: string, message: string): Error {
    const error = new Error(message) as any;
    error.statusCode = 400;
    error.code = ErrorCodes.VALIDATION_ERROR;
    error.details = [{ field, message }];
    return error;
  }
  
  /**
   * Not found error helper
   */
  createNotFoundError(resource: string, id?: string | number): Error {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    const error = new Error(message) as any;
    error.statusCode = 404;
    error.code = ErrorCodes.NOT_FOUND;
    return error;
  }
  
  /**
   * Forbidden error helper
   */
  createForbiddenError(message: string = 'Access denied'): Error {
    const error = new Error(message) as any;
    error.statusCode = 403;
    error.code = ErrorCodes.FORBIDDEN;
    return error;
  }
  
  /**
   * Rate limit error helper
   */
  createRateLimitError(retryAfter?: number): Error {
    const error = new Error('Too many requests') as any;
    error.statusCode = 429;
    error.code = ErrorCodes.RATE_LIMITED;
    if (retryAfter) {
      error.details = { retryAfter };
    }
    return error;
  }
  
  /**
   * Service unavailable error helper
   */
  createServiceUnavailableError(service: string): Error {
    const error = new Error(`${service} service is unavailable`) as any;
    error.statusCode = 503;
    error.code = ErrorCodes.SERVICE_UNAVAILABLE;
    return error;
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
}

// Export singleton instance
export const errorMiddleware = new ErrorMiddleware();