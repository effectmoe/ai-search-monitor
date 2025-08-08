import { Response, NextFunction } from 'express';
import { 
  AuthenticatedRequest, 
  MetricsQuerySchema,
  ErrorCodes,
} from '../types/api.types';
import { errorMiddleware } from '../middleware/error.middleware';
import { scrapingResultRepository, dailyMetricsRepository } from '../../database';
import { logger } from '../../utils/logger';

export class AnalyticsController {
  /**
   * Get comprehensive analytics dashboard data
   * GET /api/v1/analytics/dashboard
   */
  getDashboard = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { days = 30 } = req.query as any;
      const clientIds = req.user?.role === 'admin' ? undefined : req.user?.clientIds;
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (parseInt(days) * 24 * 60 * 60 * 1000));
      
      // Get overview metrics
      const overview = await this.getOverviewMetrics(clientIds, startDate, endDate);
      
      // Get platform performance
      const platformMetrics = await this.getPlatformMetrics(clientIds, startDate, endDate);
      
      // Get trend data
      const trends = await this.getTrendData(clientIds, startDate, endDate);
      
      // Get top performing queries
      const topQueries = await this.getTopQueries(clientIds, startDate, endDate);
      
      // Get brand mention insights
      const brandMentions = await this.getBrandMentionInsights(clientIds, startDate, endDate);
      
      // Get visibility scores
      const visibilityScores = await this.getVisibilityScores(clientIds, startDate, endDate);
      
      const dashboardData = {
        overview,
        platformMetrics,
        trends,
        topQueries,
        brandMentions,
        visibilityScores,
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          days: parseInt(days),
        },
      };
      
      return res.success(dashboardData, {
        refreshInterval: 5 * 60 * 1000, // 5 minutes
        cacheExpiry: 2 * 60 * 1000,     // 2 minutes
      });
    }
  );
  
  /**
   * Get metrics for specific client
   * GET /api/v1/analytics/clients/:clientId/metrics
   */
  getClientMetrics = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientId = parseInt(req.params.clientId);
      const query = MetricsQuerySchema.parse(req.query);
      
      // Check access permissions
      if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(clientId)) {
        throw errorMiddleware.createForbiddenError('Access denied to this client');
      }
      
      const endDate = query.endDate ? new Date(query.endDate) : new Date();
      const startDate = query.startDate 
        ? new Date(query.startDate) 
        : new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
      
      // Get client metrics
      const metrics = await scrapingResultRepository.getMetrics({
        clientIds: [clientId],
        platform: query.platform,
        startTime: startDate,
        endTime: endDate,
        granularity: query.granularity,
      });
      
      // Process metrics by granularity
      const processedMetrics = this.processMetricsByGranularity(metrics, query.granularity);
      
      // Get additional insights
      const insights = await this.getClientInsights(clientId, startDate, endDate);
      
      return res.success({
        metrics: processedMetrics,
        insights,
        summary: {
          totalQueries: metrics.length,
          successRate: this.calculateSuccessRate(metrics),
          averageVisibilityScore: this.calculateAverageVisibilityScore(metrics),
          averageResponseTime: this.calculateAverageResponseTime(metrics),
        },
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          granularity: query.granularity,
        },
      });
    }
  );
  
  /**
   * Get platform comparison analytics
   * GET /api/v1/analytics/platforms/comparison
   */
  getPlatformComparison = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { days = 30, clientId } = req.query as any;
      let clientIds = req.user?.role === 'admin' ? undefined : req.user?.clientIds;
      
      if (clientId) {
        const id = parseInt(clientId);
        if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(id)) {
          throw errorMiddleware.createForbiddenError('Access denied to this client');
        }
        clientIds = [id];
      }
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (parseInt(days) * 24 * 60 * 60 * 1000));
      
      const platforms = ['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai'];
      const comparison: Record<string, any> = {};
      
      for (const platform of platforms) {
        const metrics = await scrapingResultRepository.getMetrics({
          clientIds,
          platform,
          startTime: startDate,
          endTime: endDate,
          granularity: 'day',
        });
        
        comparison[platform] = {
          totalQueries: metrics.length,
          successfulQueries: metrics.filter(m => m.status === 'completed').length,
          successRate: this.calculateSuccessRate(metrics),
          averageResponseTime: this.calculateAverageResponseTime(metrics),
          averageVisibilityScore: this.calculateAverageVisibilityScore(metrics),
          brandMentionRate: this.calculateBrandMentionRate(metrics),
          competitorMentionRate: this.calculateCompetitorMentionRate(metrics),
          trends: this.calculateTrends(metrics),
        };
      }
      
      // Rank platforms by performance
      const rankings = this.rankPlatforms(comparison);
      
      return res.success({
        comparison,
        rankings,
        insights: this.generatePlatformInsights(comparison),
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          days: parseInt(days),
        },
      });
    }
  );
  
  /**
   * Get brand mention analysis
   * GET /api/v1/analytics/brand-mentions
   */
  getBrandMentionAnalysis = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { days = 30, clientId, brand } = req.query as any;
      let clientIds = req.user?.role === 'admin' ? undefined : req.user?.clientIds;
      
      if (clientId) {
        const id = parseInt(clientId);
        if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(id)) {
          throw errorMiddleware.createForbiddenError('Access denied to this client');
        }
        clientIds = [id];
      }
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (parseInt(days) * 24 * 60 * 60 * 1000));
      
      // Get brand mention data
      const brandMentions = await scrapingResultRepository.getBrandMentions({
        clientIds,
        brandName: brand,
        startTime: startDate,
        endTime: endDate,
      });
      
      // Analyze mention patterns
      const analysis = {
        totalMentions: brandMentions.length,
        mentionsByPlatform: this.groupByPlatform(brandMentions),
        mentionsByBrand: this.groupByBrand(brandMentions),
        sentimentAnalysis: this.analyzeSentiment(brandMentions),
        positionAnalysis: this.analyzePositions(brandMentions),
        timelineData: this.createTimeline(brandMentions, 'day'),
        topContexts: this.getTopContexts(brandMentions),
        competitorComparison: await this.getCompetitorComparison(clientIds, startDate, endDate),
      };
      
      return res.success(analysis, {
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          days: parseInt(days),
        },
        filters: {
          clientId,
          brand,
        },
      });
    }
  );
  
  /**
   * Get visibility score trends
   * GET /api/v1/analytics/visibility-trends
   */
  getVisibilityTrends = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { days = 30, clientId, granularity = 'day' } = req.query as any;
      let clientIds = req.user?.role === 'admin' ? undefined : req.user?.clientIds;
      
      if (clientId) {
        const id = parseInt(clientId);
        if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(id)) {
          throw errorMiddleware.createForbiddenError('Access denied to this client');
        }
        clientIds = [id];
      }
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (parseInt(days) * 24 * 60 * 60 * 1000));
      
      // Get visibility scores over time
      const visibilityData = await scrapingResultRepository.getVisibilityScores({
        clientIds,
        startTime: startDate,
        endTime: endDate,
        granularity,
      });
      
      // Calculate trends
      const trends = {
        timeline: this.createVisibilityTimeline(visibilityData, granularity),
        overall: {
          averageScore: this.calculateAverageVisibilityScore(visibilityData),
          trend: this.calculateTrend(visibilityData),
          bestPerformingPlatform: this.getBestPerformingPlatform(visibilityData),
          worstPerformingPlatform: this.getWorstPerformingPlatform(visibilityData),
        },
        byPlatform: this.getVisibilityByPlatform(visibilityData),
        insights: this.generateVisibilityInsights(visibilityData),
      };
      
      return res.success(trends, {
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          days: parseInt(days),
        },
        granularity,
      });
    }
  );
  
  /**
   * Export analytics data
   * GET /api/v1/analytics/export
   */
  exportData = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { 
        format = 'json', 
        days = 30, 
        clientId, 
        includeRawData = false 
      } = req.query as any;
      
      let clientIds = req.user?.role === 'admin' ? undefined : req.user?.clientIds;
      
      if (clientId) {
        const id = parseInt(clientId);
        if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(id)) {
          throw errorMiddleware.createForbiddenError('Access denied to this client');
        }
        clientIds = [id];
      }
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (parseInt(days) * 24 * 60 * 60 * 1000));
      
      // Gather all data for export
      const exportData: any = {
        metadata: {
          exportDate: new Date().toISOString(),
          timeRange: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            days: parseInt(days),
          },
          format,
          includeRawData: includeRawData === 'true',
        },
        summary: await this.getOverviewMetrics(clientIds, startDate, endDate),
        platformMetrics: await this.getPlatformMetrics(clientIds, startDate, endDate),
        trends: await this.getTrendData(clientIds, startDate, endDate),
        brandMentions: await this.getBrandMentionInsights(clientIds, startDate, endDate),
        visibilityScores: await this.getVisibilityScores(clientIds, startDate, endDate),
      };
      
      // Include raw data if requested
      if (includeRawData === 'true') {
        const rawData = await scrapingResultRepository.findByFilters({
          clientIds,
          startTime: startDate,
          endTime: endDate,
        });
        exportData.rawData = rawData;
      }
      
      // Set appropriate headers based on format
      if (format === 'csv') {
        res.set({
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="analytics-${Date.now()}.csv"`,
        });
        
        // Convert to CSV (simplified)
        const csv = this.convertToCSV(exportData);
        return res.send(csv);
        
      } else {
        res.set({
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="analytics-${Date.now()}.json"`,
        });
        
        return res.json(exportData);
      }
    }
  );
  
  // Helper methods
  private async getOverviewMetrics(clientIds: number[] | undefined, startDate: Date, endDate: Date) {
    const metrics = await scrapingResultRepository.getMetrics({
      clientIds,
      startTime: startDate,
      endTime: endDate,
    });
    
    return {
      totalQueries: metrics.length,
      successfulQueries: metrics.filter(m => m.status === 'completed').length,
      failedQueries: metrics.filter(m => m.status === 'failed').length,
      successRate: this.calculateSuccessRate(metrics),
      averageResponseTime: this.calculateAverageResponseTime(metrics),
      averageVisibilityScore: this.calculateAverageVisibilityScore(metrics),
      totalBrandMentions: metrics.reduce((sum, m) => sum + (m.brand_mention_count || 0), 0),
      totalCompetitorMentions: metrics.reduce((sum, m) => sum + (m.competitor_mention_count || 0), 0),
    };
  }
  
  private async getPlatformMetrics(clientIds: number[] | undefined, startDate: Date, endDate: Date) {
    const platforms = ['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai'];
    const platformMetrics: Record<string, any> = {};
    
    for (const platform of platforms) {
      const metrics = await scrapingResultRepository.getMetrics({
        clientIds,
        platform,
        startTime: startDate,
        endTime: endDate,
      });
      
      platformMetrics[platform] = {
        totalQueries: metrics.length,
        successRate: this.calculateSuccessRate(metrics),
        averageResponseTime: this.calculateAverageResponseTime(metrics),
        averageVisibilityScore: this.calculateAverageVisibilityScore(metrics),
      };
    }
    
    return platformMetrics;
  }
  
  private async getTrendData(clientIds: number[] | undefined, startDate: Date, endDate: Date) {
    const metrics = await scrapingResultRepository.getMetrics({
      clientIds,
      startTime: startDate,
      endTime: endDate,
      granularity: 'day',
    });
    
    return this.createTimeline(metrics, 'day');
  }
  
  private async getTopQueries(clientIds: number[] | undefined, startDate: Date, endDate: Date) {
    // This would need a specific query to get top performing queries
    // For now, return empty array
    return [];
  }
  
  private async getBrandMentionInsights(clientIds: number[] | undefined, startDate: Date, endDate: Date) {
    const brandMentions = await scrapingResultRepository.getBrandMentions({
      clientIds,
      startTime: startDate,
      endTime: endDate,
    });
    
    return {
      totalMentions: brandMentions.length,
      byPlatform: this.groupByPlatform(brandMentions),
      byBrand: this.groupByBrand(brandMentions),
      sentimentDistribution: this.analyzeSentiment(brandMentions),
    };
  }
  
  private async getVisibilityScores(clientIds: number[] | undefined, startDate: Date, endDate: Date) {
    const visibilityData = await scrapingResultRepository.getVisibilityScores({
      clientIds,
      startTime: startDate,
      endTime: endDate,
    });
    
    return {
      averageScore: this.calculateAverageVisibilityScore(visibilityData),
      byPlatform: this.getVisibilityByPlatform(visibilityData),
      trend: this.calculateTrend(visibilityData),
    };
  }
  
  // Utility calculation methods
  private calculateSuccessRate(metrics: any[]): number {
    if (metrics.length === 0) return 0;
    const successful = metrics.filter(m => m.status === 'completed').length;
    return Math.round((successful / metrics.length) * 100 * 100) / 100;
  }
  
  private calculateAverageResponseTime(metrics: any[]): number {
    const validMetrics = metrics.filter(m => m.execution_time != null);
    if (validMetrics.length === 0) return 0;
    
    const totalTime = validMetrics.reduce((sum, m) => sum + m.execution_time, 0);
    return Math.round(totalTime / validMetrics.length);
  }
  
  private calculateAverageVisibilityScore(metrics: any[]): number {
    const validMetrics = metrics.filter(m => m.visibility_score != null);
    if (validMetrics.length === 0) return 0;
    
    const totalScore = validMetrics.reduce((sum, m) => sum + m.visibility_score, 0);
    return Math.round((totalScore / validMetrics.length) * 100) / 100;
  }
  
  private calculateBrandMentionRate(metrics: any[]): number {
    if (metrics.length === 0) return 0;
    const withMentions = metrics.filter(m => (m.brand_mention_count || 0) > 0).length;
    return Math.round((withMentions / metrics.length) * 100 * 100) / 100;
  }
  
  private calculateCompetitorMentionRate(metrics: any[]): number {
    if (metrics.length === 0) return 0;
    const withMentions = metrics.filter(m => (m.competitor_mention_count || 0) > 0).length;
    return Math.round((withMentions / metrics.length) * 100 * 100) / 100;
  }
  
  private processMetricsByGranularity(metrics: any[], granularity: string): any[] {
    // Group metrics by time granularity
    return this.createTimeline(metrics, granularity);
  }
  
  private createTimeline(data: any[], granularity: string): any[] {
    const groups: Record<string, any[]> = {};
    
    // Determine grouping interval
    let intervalMs: number;
    switch (granularity) {
      case 'hour':
        intervalMs = 60 * 60 * 1000;
        break;
      case 'day':
        intervalMs = 24 * 60 * 60 * 1000;
        break;
      case 'week':
        intervalMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        intervalMs = 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        intervalMs = 24 * 60 * 60 * 1000;
    }
    
    // Group data by interval
    for (const item of data) {
      const timestamp = new Date(item.scraped_at || item.created_at).getTime();
      const intervalStart = Math.floor(timestamp / intervalMs) * intervalMs;
      const key = new Date(intervalStart).toISOString();
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    }
    
    // Convert to timeline format
    return Object.entries(groups)
      .map(([timestamp, items]) => ({
        timestamp,
        total: items.length,
        successful: items.filter(i => i.status === 'completed').length,
        failed: items.filter(i => i.status === 'failed').length,
        averageResponseTime: this.calculateAverageResponseTime(items),
        averageVisibilityScore: this.calculateAverageVisibilityScore(items),
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
  
  private groupByPlatform(data: any[]): Record<string, number> {
    return data.reduce((acc, item) => {
      const platform = item.platform;
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {});
  }
  
  private groupByBrand(data: any[]): Record<string, number> {
    return data.reduce((acc, item) => {
      const brand = item.brand_name || 'Unknown';
      acc[brand] = (acc[brand] || 0) + 1;
      return acc;
    }, {});
  }
  
  private analyzeSentiment(data: any[]): Record<string, number> {
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    
    for (const item of data) {
      const score = item.sentiment_score || 0;
      if (score > 0.1) {
        sentiments.positive++;
      } else if (score < -0.1) {
        sentiments.negative++;
      } else {
        sentiments.neutral++;
      }
    }
    
    return sentiments;
  }
  
  private calculateTrends(metrics: any[]): any {
    // Simple trend calculation based on recent vs older data
    if (metrics.length < 2) return { direction: 'stable', change: 0 };
    
    const sorted = metrics.sort((a, b) => 
      new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime()
    );
    
    const half = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, half);
    const newer = sorted.slice(half);
    
    const olderAvg = this.calculateAverageVisibilityScore(older);
    const newerAvg = this.calculateAverageVisibilityScore(newer);
    
    const change = ((newerAvg - olderAvg) / (olderAvg || 1)) * 100;
    
    return {
      direction: change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable',
      change: Math.round(change * 100) / 100,
    };
  }
  
  private convertToCSV(data: any): string {
    // Simple CSV conversion - in production you'd want a proper CSV library
    const rows = [
      ['Date', 'Platform', 'Client', 'Query', 'Status', 'Response Time', 'Visibility Score'],
      // Add data rows here
    ];
    
    return rows.map(row => row.join(',')).join('\n');
  }
  
  // Placeholder methods for complex analytics
  private async getClientInsights(clientId: number, startDate: Date, endDate: Date): Promise<any[]> {
    return [];
  }
  
  private rankPlatforms(comparison: Record<string, any>): any[] {
    return Object.entries(comparison)
      .map(([platform, data]) => ({ platform, ...data }))
      .sort((a, b) => b.averageVisibilityScore - a.averageVisibilityScore);
  }
  
  private generatePlatformInsights(comparison: Record<string, any>): any[] {
    return [];
  }
  
  private analyzePositions(data: any[]): any {
    return {};
  }
  
  private getTopContexts(data: any[]): any[] {
    return [];
  }
  
  private async getCompetitorComparison(clientIds: number[] | undefined, startDate: Date, endDate: Date): Promise<any> {
    return {};
  }
  
  private createVisibilityTimeline(data: any[], granularity: string): any[] {
    return this.createTimeline(data, granularity);
  }
  
  private calculateTrend(data: any[]): any {
    return this.calculateTrends(data);
  }
  
  private getBestPerformingPlatform(data: any[]): string {
    const byPlatform = this.getVisibilityByPlatform(data);
    const best = Object.entries(byPlatform)
      .sort(([,a], [,b]) => (b as any).average - (a as any).average)[0];
    return best?.[0] || 'N/A';
  }
  
  private getWorstPerformingPlatform(data: any[]): string {
    const byPlatform = this.getVisibilityByPlatform(data);
    const worst = Object.entries(byPlatform)
      .sort(([,a], [,b]) => (a as any).average - (b as any).average)[0];
    return worst?.[0] || 'N/A';
  }
  
  private getVisibilityByPlatform(data: any[]): Record<string, any> {
    const byPlatform: Record<string, any[]> = {};
    
    for (const item of data) {
      const platform = item.platform;
      if (!byPlatform[platform]) byPlatform[platform] = [];
      byPlatform[platform].push(item);
    }
    
    const result: Record<string, any> = {};
    for (const [platform, items] of Object.entries(byPlatform)) {
      result[platform] = {
        average: this.calculateAverageVisibilityScore(items),
        count: items.length,
        trend: this.calculateTrends(items),
      };
    }
    
    return result;
  }
  
  private generateVisibilityInsights(data: any[]): any[] {
    return [];
  }
}

// Export singleton instance
export const analyticsController = new AnalyticsController();