import { Request, Response } from 'express';
import { HealthCheckResponse, PlatformStatusResponse } from '../types/api.types';
import { errorMiddleware } from '../middleware/error.middleware';
import { dbInitializer } from '../../database';
import { logger } from '../../utils/logger';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';

export class HealthController {
  private startTime = Date.now();
  
  /**
   * Basic health check endpoint
   * GET /api/v1/health
   */
  getHealth = errorMiddleware.asyncHandler(
    async (req: Request, res: Response) => {
      const uptime = Date.now() - this.startTime;
      
      const health: HealthCheckResponse = {
        status: 'healthy',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime,
        services: {
          database: await this.checkDatabaseHealth(),
          platforms: await this.checkPlatformHealth(),
        },
      };
      
      // Determine overall status
      const dbHealthy = health.services.database.status === 'healthy';
      const platformsHealthy = Object.values(health.services.platforms)
        .some(platform => platform.status === 'healthy');
      
      if (!dbHealthy) {
        health.status = 'unhealthy';
      } else if (!platformsHealthy) {
        health.status = 'degraded';
      }
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      return res.status(statusCode).json(health);
    }
  );
  
  /**
   * Detailed health check with metrics
   * GET /api/v1/health/detailed
   */
  getDetailedHealth = errorMiddleware.asyncHandler(
    async (req: Request, res: Response) => {
      const uptime = Date.now() - this.startTime;
      
      // Get database health with detailed stats
      const databaseHealth = await dbInitializer.getHealthStatus();
      
      // Get system metrics
      const systemMetrics = this.getSystemMetrics();
      
      // Get rate limiting stats
      const rateLimitStats = rateLimitMiddleware.getStats();
      
      const health: HealthCheckResponse & { system?: any, rateLimiting?: any } = {
        status: 'healthy',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime,
        services: {
          database: {
            status: databaseHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
            responseTime: this.measureDatabaseResponseTime(),
            details: databaseHealth,
          },
          platforms: await this.checkPlatformHealth(),
        },
        metrics: {
          requestCount: 0, // TODO: Implement request counter
          averageResponseTime: 0, // TODO: Implement response time tracking
          errorRate: 0, // TODO: Implement error rate tracking
        },
        system: systemMetrics,
        rateLimiting: rateLimitStats,
      };
      
      // Determine overall status
      const dbHealthy = health.services.database.status === 'healthy';
      const platformsHealthy = Object.values(health.services.platforms)
        .some(platform => platform.status === 'healthy');
      
      if (!dbHealthy) {
        health.status = 'unhealthy';
      } else if (!platformsHealthy) {
        health.status = 'degraded';
      }
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      
      return res.status(statusCode).json(health);
    }
  );
  
  /**
   * Readiness probe for Kubernetes
   * GET /api/v1/health/ready
   */
  getReadiness = errorMiddleware.asyncHandler(
    async (req: Request, res: Response) => {
      // Check if application is ready to serve traffic
      const dbHealth = await this.checkDatabaseHealth();
      
      if (dbHealth.status !== 'healthy') {
        return res.status(503).json({
          status: 'not ready',
          reason: 'Database not available',
          timestamp: new Date().toISOString(),
        });
      }
      
      return res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    }
  );
  
  /**
   * Liveness probe for Kubernetes  
   * GET /api/v1/health/live
   */
  getLiveness = errorMiddleware.asyncHandler(
    async (req: Request, res: Response) => {
      // Simple liveness check - if this endpoint responds, app is alive
      return res.status(200).json({
        status: 'alive',
        uptime: Date.now() - this.startTime,
        timestamp: new Date().toISOString(),
      });
    }
  );
  
  /**
   * Check database connection status
   * GET /api/v1/health/database
   */
  getDatabaseHealth = errorMiddleware.asyncHandler(
    async (req: Request, res: Response) => {
      const dbHealth = await dbInitializer.getHealthStatus();
      const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
      
      return res.status(statusCode).json(dbHealth);
    }
  );
  
  /**
   * Check platform availability
   * GET /api/v1/health/platforms
   */
  getPlatformHealth = errorMiddleware.asyncHandler(
    async (req: Request, res: Response) => {
      const platformHealth = await this.checkPlatformHealth();
      
      // Check if any platforms are healthy
      const hasHealthyPlatforms = Object.values(platformHealth)
        .some(platform => platform.status === 'healthy');
      
      const statusCode = hasHealthyPlatforms ? 200 : 503;
      
      return res.status(statusCode).json({
        status: hasHealthyPlatforms ? 'healthy' : 'unhealthy',
        platforms: platformHealth,
        timestamp: new Date().toISOString(),
      });
    }
  );
  
  /**
   * Get application metrics
   * GET /api/v1/health/metrics
   */
  getMetrics = errorMiddleware.asyncHandler(
    async (req: Request, res: Response) => {
      const metrics = {
        uptime: Date.now() - this.startTime,
        system: this.getSystemMetrics(),
        database: await dbInitializer.getHealthStatus(),
        rateLimiting: rateLimitMiddleware.getStats(),
        timestamp: new Date().toISOString(),
      };
      
      return res.json(metrics);
    }
  );
  
  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<{status: 'healthy' | 'unhealthy', responseTime?: number, details?: any}> {
    try {
      const startTime = Date.now();
      const healthStatus = await dbInitializer.getHealthStatus();
      const responseTime = Date.now() - startTime;
      
      return {
        status: healthStatus.status === 'healthy' ? 'healthy' : 'unhealthy',
        responseTime,
        details: healthStatus,
      };
      
    } catch (error: any) {
      logger.error('Database health check failed', {
        error: error.message,
        stack: error.stack,
      });
      
      return {
        status: 'unhealthy',
        details: { error: error.message },
      };
    }
  }
  
  /**
   * Check platform availability
   */
  private async checkPlatformHealth(): Promise<Record<string, PlatformStatusResponse>> {
    const platforms = ['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai'];
    const platformHealth: Record<string, PlatformStatusResponse> = {};
    
    // In a real implementation, you would actually test connectivity to each platform
    // For now, we'll simulate based on circuit breaker states and recent activity
    
    for (const platform of platforms) {
      try {
        // TODO: Implement actual platform connectivity check
        // For now, simulate based on environment or recent activity
        
        const isAvailable = Math.random() > 0.1; // 90% availability simulation
        const responseTime = Math.floor(Math.random() * 2000) + 500; // 500-2500ms
        const errorRate = Math.random() * 5; // 0-5% error rate
        
        platformHealth[platform] = {
          platform,
          isAvailable,
          circuitBreakerState: isAvailable ? 'closed' : 'open',
          lastChecked: new Date().toISOString(),
          responseTime: isAvailable ? responseTime : undefined,
          errorRate: isAvailable ? errorRate : 100,
          requestCount: Math.floor(Math.random() * 1000),
        };
        
      } catch (error: any) {
        platformHealth[platform] = {
          platform,
          isAvailable: false,
          circuitBreakerState: 'open',
          lastChecked: new Date().toISOString(),
          errorRate: 100,
        };
      }
    }
    
    // Update status based on response times and error rates
    for (const [platform, status] of Object.entries(platformHealth)) {
      if (status.isAvailable) {
        if (status.responseTime && status.responseTime > 5000) {
          status.isAvailable = false;
          status.circuitBreakerState = 'half-open';
        } else if (status.errorRate && status.errorRate > 50) {
          status.isAvailable = false;
          status.circuitBreakerState = 'open';
        }
      }
    }
    
    return platformHealth;
  }
  
  /**
   * Measure database response time
   */
  private async measureDatabaseResponseTime(): Promise<number> {
    try {
      const startTime = Date.now();
      await dbInitializer.getHealthStatus();
      return Date.now() - startTime;
    } catch {
      return -1;
    }
  }
  
  /**
   * Get system metrics
   */
  private getSystemMetrics(): any {
    const used = process.memoryUsage();
    const loadAverage = process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0];
    
    return {
      memory: {
        rss: Math.round(used.rss / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100, // MB
        heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(used.external / 1024 / 1024 * 100) / 100, // MB
      },
      cpu: {
        loadAverage: loadAverage.map((load: number) => Math.round(load * 100) / 100),
        usage: process.cpuUsage(),
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      uptime: {
        process: Math.floor(process.uptime()),
        system: require('os').uptime(),
      },
    };
  }
}

// Export singleton instance
export const healthController = new HealthController();