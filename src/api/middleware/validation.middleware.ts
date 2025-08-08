import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, PaginationQuery, ErrorCodes } from '../types/api.types';
import { logger } from '../../utils/logger';

export class ValidationMiddleware {
  /**
   * Validate request body with Zod schema
   */
  validateBody<T>(schema: z.ZodSchema<T>) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      try {
        const validatedData = schema.parse(req.body);
        req.body = validatedData;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          const details = error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
            received: e.received,
          }));
          
          logger.warn('Request body validation failed', {
            url: req.url,
            method: req.method,
            errors: details,
            body: req.body,
          });
          
          res.status(400).json({
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: 'Request body validation failed',
              details,
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: '1.0.0',
            },
          });
        } else {
          next(error);
        }
      }
    };
  }
  
  /**
   * Validate query parameters with Zod schema
   */
  validateQuery<T>(schema: z.ZodSchema<T>) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      try {
        const validatedData = schema.parse(req.query);
        req.query = validatedData as any;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          const details = error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
            received: e.received,
          }));
          
          logger.warn('Request query validation failed', {
            url: req.url,
            method: req.method,
            errors: details,
            query: req.query,
          });
          
          res.status(400).json({
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: 'Query parameter validation failed',
              details,
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: '1.0.0',
            },
          });
        } else {
          next(error);
        }
      }
    };
  }
  
  /**
   * Validate route parameters with Zod schema
   */
  validateParams<T>(schema: z.ZodSchema<T>) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      try {
        const validatedData = schema.parse(req.params);
        req.params = validatedData as any;
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          const details = error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
            received: e.received,
          }));
          
          logger.warn('Request params validation failed', {
            url: req.url,
            method: req.method,
            errors: details,
            params: req.params,
          });
          
          res.status(400).json({
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: 'Route parameter validation failed',
              details,
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: '1.0.0',
            },
          });
        } else {
          next(error);
        }
      }
    };
  }
  
  /**
   * Validate pagination query parameters
   */
  validatePagination() {
    const paginationSchema = z.object({
      page: z.coerce.number().min(1).optional().default(1),
      limit: z.coerce.number().min(1).max(1000).optional().default(50),
      sort: z.string().optional(),
      order: z.enum(['asc', 'desc']).optional().default('desc'),
    });
    
    return this.validateQuery(paginationSchema);
  }
  
  /**
   * Validate ID parameter (must be positive integer)
   */
  validateId(paramName: string = 'id') {
    const idSchema = z.object({
      [paramName]: z.coerce.number().int().positive(),
    });
    
    return this.validateParams(idSchema);
  }
  
  /**
   * Validate client ID access
   */
  validateClientId() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      const clientId = parseInt(req.params.clientId || req.query.clientId as string);
      
      if (!clientId || isNaN(clientId) || clientId <= 0) {
        res.status(400).json({
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'Valid client ID is required',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
          },
        });
        return;
      }
      
      // Check if user has access to this client (unless admin)
      if (req.user && req.user.role !== 'admin') {
        if (!req.user.clientIds || !req.user.clientIds.includes(clientId)) {
          res.status(403).json({
            success: false,
            error: {
              code: ErrorCodes.FORBIDDEN,
              message: 'Access denied to this client',
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: '1.0.0',
            },
          });
          return;
        }
      }
      
      next();
    };
  }
  
  /**
   * Validate date range parameters
   */
  validateDateRange() {
    const dateRangeSchema = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }).refine((data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    }, {
      message: 'Start date must be before or equal to end date',
    });
    
    return this.validateQuery(dateRangeSchema);
  }
  
  /**
   * Validate platform parameter
   */
  validatePlatform() {
    const platformSchema = z.object({
      platform: z.enum(['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai']).optional(),
    });
    
    return this.validateQuery(platformSchema);
  }
  
  /**
   * Validate content type for JSON requests
   */
  validateContentType() {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const contentType = req.get('Content-Type');
        
        if (!contentType || !contentType.includes('application/json')) {
          res.status(400).json({
            success: false,
            error: {
              code: ErrorCodes.INVALID_REQUEST,
              message: 'Content-Type must be application/json',
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: '1.0.0',
            },
          });
          return;
        }
      }
      
      next();
    };
  }
  
  /**
   * Sanitize input to prevent XSS and injection attacks
   */
  sanitizeInput() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (req.body && typeof req.body === 'object') {
        req.body = this.sanitizeObject(req.body);
      }
      
      if (req.query && typeof req.query === 'object') {
        req.query = this.sanitizeObject(req.query);
      }
      
      next();
    };
  }
  
  /**
   * Recursively sanitize object properties
   */
  private sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'string') {
      // Basic XSS prevention
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  }
}

// Export singleton instance
export const validationMiddleware = new ValidationMiddleware();