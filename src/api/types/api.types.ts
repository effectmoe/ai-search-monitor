// API Types and Interfaces

import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// Base API Response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    version: string;
    executionTime?: number;
    [key: string]: any;
  };
}

// Pagination
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Authentication
export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'readonly';
  permissions: string[];
  clientIds?: number[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

// Monitoring
export const MonitoringRequestSchema = z.object({
  clientIds: z.array(z.number()).optional(),
  platforms: z.array(z.enum(['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai'])).optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  retryOnFailure: z.boolean().default(true),
  maxRetries: z.number().min(0).max(5).default(3),
  timeout: z.number().min(1000).max(300000).default(30000),
});

export type MonitoringRequest = z.infer<typeof MonitoringRequestSchema>;

// Client Management
export const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  brandNames: z.array(z.string().min(1)),
  competitorNames: z.array(z.string().min(1)).optional(),
  keywords: z.array(z.string().min(1)),
  isActive: z.boolean().default(true),
});

export const UpdateClientSchema = CreateClientSchema.partial();

export type CreateClientRequest = z.infer<typeof CreateClientSchema>;
export type UpdateClientRequest = z.infer<typeof UpdateClientSchema>;

// Platform Status
export interface PlatformStatusResponse {
  platform: string;
  isAvailable: boolean;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  lastChecked: string;
  responseTime?: number;
  errorRate?: number;
  requestCount?: number;
}

// Metrics
export const MetricsQuerySchema = z.object({
  clientId: z.number().optional(),
  platform: z.enum(['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
});

export type MetricsQuery = z.infer<typeof MetricsQuerySchema>;

// Error Handling
export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: any;
}

export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  
  // Resources
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_EXISTS: 'RESOURCE_EXISTS',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
  
  // Business Logic
  CLIENT_INACTIVE: 'CLIENT_INACTIVE',
  PLATFORM_UNAVAILABLE: 'PLATFORM_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  
  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
} as const;

// Middleware Types
export type ApiMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

export type ErrorHandler = (
  error: any,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => void;

// Rate Limiting
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipIf?: (req: Request) => boolean;
  keyGenerator?: (req: Request) => string;
}

// Health Check
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      details?: any;
    };
    platforms: {
      [platform: string]: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        responseTime?: number;
        errorRate?: number;
      };
    };
  };
  metrics?: {
    requestCount: number;
    averageResponseTime: number;
    errorRate: number;
  };
}

// Webhook
export const WebhookEventSchema = z.object({
  type: z.enum(['monitoring.completed', 'monitoring.failed', 'client.created', 'client.updated']),
  clientId: z.number(),
  data: z.record(z.any()),
  timestamp: z.string().datetime(),
  signature: z.string(),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;