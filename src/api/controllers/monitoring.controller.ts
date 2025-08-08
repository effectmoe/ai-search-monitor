import { Response, NextFunction } from 'express';
import { 
  AuthenticatedRequest, 
  MonitoringRequestSchema,
  ErrorCodes,
} from '../types/api.types';
import { errorMiddleware } from '../middleware/error.middleware';
import { monitoringWorkflow } from '../../core/mastra/workflows/monitoring.workflow';
import { clientRepository, scrapingResultRepository } from '../../database';
import { logger } from '../../utils/logger';

export class MonitoringController {
  /**
   * Start monitoring for specified clients and platforms
   * POST /api/v1/monitoring/start
   */
  startMonitoring = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const validatedInput = MonitoringRequestSchema.parse(req.body);
      
      logger.info('Starting monitoring workflow', {
        input: validatedInput,
        userId: req.user?.id,
        requestId: (req as any).requestId,
      });
      
      // Check client access permissions
      if (validatedInput.clientIds && req.user?.role !== 'admin') {
        const userClientIds = req.user?.clientIds || [];
        const hasAccess = validatedInput.clientIds.every(id => userClientIds.includes(id));
        
        if (!hasAccess) {
          throw errorMiddleware.createForbiddenError('Access denied to one or more specified clients');
        }
      }
      
      // Filter client IDs based on user permissions
      let clientIds = validatedInput.clientIds;
      if (req.user?.role !== 'admin' && req.user?.clientIds) {
        clientIds = clientIds 
          ? clientIds.filter(id => req.user!.clientIds!.includes(id))
          : req.user.clientIds;
      }
      
      // Execute monitoring workflow
      const result = await monitoringWorkflow.execute({
        input: {
          ...validatedInput,
          clientIds,
        },
        tools: {},
        agents: new Map(), // Agents will be injected by Mastra
      });
      
      logger.info('Monitoring workflow completed', {
        success: result.success,
        resultCount: result.results?.length || 0,
        errorCount: result.errors?.length || 0,
        executionTime: result.stats?.executionTime,
        userId: req.user?.id,
        requestId: (req as any).requestId,
      });
      
      return res.success(result, {
        workflowVersion: '1.0.0',
        totalClients: result.stats?.totalClients,
        totalPlatforms: result.stats?.totalPlatforms,
      });
    }
  );
  
  /**
   * Get monitoring status for all platforms
   * GET /api/v1/monitoring/status
   */
  getMonitoringStatus = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientIds = req.user?.role === 'admin' ? undefined : req.user?.clientIds;
      
      // Get active clients
      const clients = await clientRepository.findActive(clientIds);
      
      // Get recent monitoring sessions (last 24 hours)
      const sessions = await scrapingResultRepository.findRecentSessions(24 * 60 * 60 * 1000);
      
      // Group by platform
      const platformStatus: Record<string, any> = {};
      const platforms = ['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai'];
      
      for (const platform of platforms) {
        const platformSessions = sessions.filter(s => s.platform === platform);
        const successCount = platformSessions.filter(s => s.status === 'completed').length;
        const totalCount = platformSessions.length;
        
        platformStatus[platform] = {
          isActive: totalCount > 0,
          successRate: totalCount > 0 ? (successCount / totalCount) * 100 : 0,
          lastActivity: platformSessions.length > 0 
            ? Math.max(...platformSessions.map(s => new Date(s.started_at).getTime()))
            : null,
          requestCount: totalCount,
        };
      }
      
      const status = {
        clients: clients.map(c => ({
          id: c.id,
          name: c.name,
          isActive: c.is_active,
          lastMonitored: null, // TODO: Get from sessions
        })),
        platforms: platformStatus,
        summary: {
          totalActiveClients: clients.filter(c => c.is_active).length,
          activePlatforms: Object.values(platformStatus).filter((p: any) => p.isActive).length,
          overallSuccessRate: this.calculateOverallSuccessRate(platformStatus),
        },
      };
      
      return res.success(status, {
        refreshInterval: 30000, // Suggest 30 second refresh
      });
    }
  );
  
  /**
   * Get monitoring history for a specific client
   * GET /api/v1/monitoring/history/:clientId
   */
  getMonitoringHistory = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientId = parseInt(req.params.clientId);
      const { page = 1, limit = 50, platform, startDate, endDate } = req.query as any;
      
      // Validate client exists and user has access
      const client = await clientRepository.findById(clientId);
      if (!client) {
        throw errorMiddleware.createNotFoundError('Client', clientId);
      }
      
      if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(clientId)) {
        throw errorMiddleware.createForbiddenError('Access denied to this client');
      }
      
      // Build filters
      const filters: any = { client_id: clientId };
      if (platform) filters.platform = platform;
      if (startDate) filters.scraped_at_start = new Date(startDate);
      if (endDate) filters.scraped_at_end = new Date(endDate);
      
      // Get paginated results
      const { results, total } = await scrapingResultRepository.findPaginated({
        filters,
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy: 'scraped_at',
        sortOrder: 'desc',
      });
      
      // Format results for API response
      const formattedResults = results.map(result => ({
        id: result.id,
        platform: result.platform,
        query: result.query,
        status: result.status,
        scrapedAt: result.scraped_at,
        executionTime: result.execution_time,
        brandMentionCount: result.brand_mention_count || 0,
        competitorMentionCount: result.competitor_mention_count || 0,
        position: result.position,
        sentimentScore: result.sentiment_score,
        visibilityScore: result.visibility_score,
        errorMessage: result.error_message,
      }));
      
      return res.paginated(
        formattedResults,
        parseInt(page),
        total,
        parseInt(limit),
        {
          clientId,
          clientName: client.name,
          filters: {
            platform,
            startDate,
            endDate,
          },
        }
      );
    }
  );
  
  /**
   * Stop monitoring for specific clients
   * POST /api/v1/monitoring/stop
   */
  stopMonitoring = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { clientIds } = req.body;
      
      // Validate input
      if (!Array.isArray(clientIds) || clientIds.length === 0) {
        throw errorMiddleware.createValidationError('clientIds', 'At least one client ID is required');
      }
      
      // Check permissions
      if (req.user?.role !== 'admin') {
        const userClientIds = req.user?.clientIds || [];
        const hasAccess = clientIds.every(id => userClientIds.includes(id));
        
        if (!hasAccess) {
          throw errorMiddleware.createForbiddenError('Access denied to one or more specified clients');
        }
      }
      
      // TODO: Implement actual stopping logic (cancel running workflows)
      // For now, we'll just update the client status
      const results = [];
      for (const clientId of clientIds) {
        try {
          const client = await clientRepository.findById(clientId);
          if (client) {
            // In a real implementation, this would cancel active monitoring sessions
            results.push({
              clientId,
              clientName: client.name,
              stopped: true,
            });
          }
        } catch (error: any) {
          results.push({
            clientId,
            stopped: false,
            error: error.message,
          });
        }
      }
      
      logger.info('Monitoring stop requested', {
        clientIds,
        results,
        userId: req.user?.id,
      });
      
      return res.success({
        message: 'Monitoring stop requested',
        results,
      });
    }
  );
  
  /**
   * Get real-time monitoring metrics
   * GET /api/v1/monitoring/metrics/realtime
   */
  getRealtimeMetrics = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientIds = req.user?.role === 'admin' ? undefined : req.user?.clientIds;
      const { platform } = req.query as any;
      
      // Get metrics from last hour
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour ago
      
      const metrics = await scrapingResultRepository.getMetrics({
        clientIds,
        platform,
        startTime,
        endTime,
        granularity: 'minute',
      });
      
      // Calculate real-time statistics
      const stats = {
        totalRequests: metrics.length,
        successfulRequests: metrics.filter(m => m.status === 'completed').length,
        failedRequests: metrics.filter(m => m.status === 'failed').length,
        averageResponseTime: this.calculateAverageResponseTime(metrics),
        averageVisibilityScore: this.calculateAverageVisibilityScore(metrics),
        platformBreakdown: this.getPlatformBreakdown(metrics),
        timeline: this.getTimelineMetrics(metrics),
      };
      
      return res.success(stats, {
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
        refreshInterval: 60000, // 1 minute
      });
    }
  );
  
  /**
   * Calculate overall success rate from platform status
   */
  private calculateOverallSuccessRate(platformStatus: Record<string, any>): number {
    const platforms = Object.values(platformStatus);
    if (platforms.length === 0) return 0;
    
    const totalSuccessRate = platforms.reduce((sum: number, platform: any) => {
      return sum + (platform.successRate || 0);
    }, 0);
    
    return totalSuccessRate / platforms.length;
  }
  
  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(metrics: any[]): number {
    if (metrics.length === 0) return 0;
    
    const validMetrics = metrics.filter(m => m.execution_time != null);
    if (validMetrics.length === 0) return 0;
    
    const totalTime = validMetrics.reduce((sum, m) => sum + m.execution_time, 0);
    return Math.round(totalTime / validMetrics.length);
  }
  
  /**
   * Calculate average visibility score
   */
  private calculateAverageVisibilityScore(metrics: any[]): number {
    if (metrics.length === 0) return 0;
    
    const validMetrics = metrics.filter(m => m.visibility_score != null);
    if (validMetrics.length === 0) return 0;
    
    const totalScore = validMetrics.reduce((sum, m) => sum + m.visibility_score, 0);
    return Math.round((totalScore / validMetrics.length) * 100) / 100;
  }
  
  /**
   * Get platform breakdown statistics
   */
  private getPlatformBreakdown(metrics: any[]): Record<string, any> {
    const breakdown: Record<string, any> = {};
    
    for (const metric of metrics) {
      const platform = metric.platform;
      
      if (!breakdown[platform]) {
        breakdown[platform] = {
          total: 0,
          successful: 0,
          failed: 0,
          avgResponseTime: 0,
          avgVisibilityScore: 0,
        };
      }
      
      breakdown[platform].total++;
      
      if (metric.status === 'completed') {
        breakdown[platform].successful++;
      } else {
        breakdown[platform].failed++;
      }
    }
    
    // Calculate averages
    for (const platform of Object.keys(breakdown)) {
      const platformMetrics = metrics.filter(m => m.platform === platform);
      breakdown[platform].avgResponseTime = this.calculateAverageResponseTime(platformMetrics);
      breakdown[platform].avgVisibilityScore = this.calculateAverageVisibilityScore(platformMetrics);
      breakdown[platform].successRate = breakdown[platform].total > 0 
        ? (breakdown[platform].successful / breakdown[platform].total) * 100 
        : 0;
    }
    
    return breakdown;
  }
  
  /**
   * Get timeline metrics (grouped by time intervals)
   */
  private getTimelineMetrics(metrics: any[]): any[] {
    // Group metrics by 5-minute intervals
    const intervals: Record<string, any> = {};
    const intervalMs = 5 * 60 * 1000; // 5 minutes
    
    for (const metric of metrics) {
      const timestamp = new Date(metric.scraped_at).getTime();
      const intervalStart = Math.floor(timestamp / intervalMs) * intervalMs;
      const intervalKey = new Date(intervalStart).toISOString();
      
      if (!intervals[intervalKey]) {
        intervals[intervalKey] = {
          timestamp: intervalKey,
          total: 0,
          successful: 0,
          failed: 0,
        };
      }
      
      intervals[intervalKey].total++;
      if (metric.status === 'completed') {
        intervals[intervalKey].successful++;
      } else {
        intervals[intervalKey].failed++;
      }
    }
    
    // Convert to array and sort by timestamp
    return Object.values(intervals).sort((a: any, b: any) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }
}

// Export singleton instance
export const monitoringController = new MonitoringController();