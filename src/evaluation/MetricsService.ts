/**
 * Metrics Service - Central service for collecting and analyzing metrics
 * Integrates with the AI Search Monitor system
 */
import { BaseMetricsCollector, BaseMetricsResult, MetricsAggregation } from './metrics/BaseMetrics';
import { logger } from '../utils/logger';
// Import the DatabaseConnection interface from mock-database
interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
}

export interface MetricsServiceConfig {
  database: DatabaseConnection;
  enableRealTimeAnalysis: boolean;
  metricsRetentionDays: number;
  costPerToken?: number; // yen per token
}

export interface QueryExecutionMetrics {
  queryId: string;
  platform: string;
  clientId: number;
  searchQuery: string;
  brandKeywords: string[];
  expectedMentions?: string[];
  startTime: number;
}

export class MetricsService {
  private metricsCollector: BaseMetricsCollector;
  private config: MetricsServiceConfig;
  private activeQueries: Map<string, QueryExecutionMetrics> = new Map();

  constructor(config: MetricsServiceConfig) {
    this.config = config;
    this.metricsCollector = new BaseMetricsCollector();
  }

  /**
   * Start tracking a new query execution
   */
  public startQueryTracking(
    queryId: string,
    platform: string,
    clientId: number,
    searchQuery: string,
    brandKeywords: string[],
    expectedMentions?: string[]
  ): void {
    const metrics: QueryExecutionMetrics = {
      queryId,
      platform,
      clientId,
      searchQuery,
      brandKeywords,
      expectedMentions,
      startTime: Date.now(),
    };

    this.activeQueries.set(queryId, metrics);
    
    logger.info('Started query tracking', {
      queryId,
      platform,
      clientId,
      service: 'metrics'
    });
  }

  /**
   * Complete query tracking and record metrics
   */
  public async completeQueryTracking(
    queryId: string,
    result: {
      success: boolean;
      response?: string;
      errorCode?: string;
      errorMessage?: string;
      tokensUsed?: number;
      apiLatency?: number;
    }
  ): Promise<BaseMetricsResult | null> {
    const queryMetrics = this.activeQueries.get(queryId);
    if (!queryMetrics) {
      logger.warn('Query metrics not found for completion', { queryId });
      return null;
    }

    const endTime = Date.now();
    const responseTime = endTime - queryMetrics.startTime;

    // Calculate quality metrics if query was successful
    let relevanceScore = 0;
    let accuracyScore = 0;
    let completenessScore = 0;
    let responseLength = 0;
    let brandMentions = 0;

    if (result.success && result.response) {
      relevanceScore = this.metricsCollector.calculateRelevanceScore(
        queryMetrics.searchQuery,
        result.response,
        queryMetrics.expectedMentions
      );

      accuracyScore = this.metricsCollector.calculateAccuracyScore(
        result.response,
        queryMetrics.brandKeywords[0] || '', // Primary brand
        queryMetrics.expectedMentions
      );

      completenessScore = this.metricsCollector.calculateCompletenessScore(result.response);
      responseLength = result.response.length;
      brandMentions = this.metricsCollector.countBrandMentions(
        result.response,
        queryMetrics.brandKeywords
      );
    }

    // Calculate cost estimate
    let costEstimate = 0;
    if (result.tokensUsed && this.config.costPerToken) {
      costEstimate = result.tokensUsed * this.config.costPerToken;
    }

    // Create metrics result
    const metricsResult: BaseMetricsResult = {
      timestamp: new Date().toISOString(),
      queryId,
      platform: queryMetrics.platform,
      clientId: queryMetrics.clientId,
      responseTime,
      apiLatency: result.apiLatency || 0,
      processingTime: responseTime - (result.apiLatency || 0),
      relevanceScore,
      accuracyScore,
      completenessScore,
      responseLength,
      keywordMatches: this.countKeywordMatches(queryMetrics.searchQuery, result.response || ''),
      brandMentions,
      tokensUsed: result.tokensUsed,
      costEstimate,
      success: result.success,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      searchQuery: queryMetrics.searchQuery,
      expectedResults: queryMetrics.expectedMentions,
      actualResult: result.response || '',
    };

    // Record the metrics
    this.metricsCollector.recordMetric(metricsResult);

    // Store in database for persistence
    await this.storeMetricsInDatabase(metricsResult);

    // Clean up active query tracking
    this.activeQueries.delete(queryId);

    // Real-time analysis if enabled
    if (this.config.enableRealTimeAnalysis) {
      await this.performRealTimeAnalysis(metricsResult);
    }

    logger.info('Query tracking completed', {
      queryId,
      responseTime,
      relevanceScore,
      accuracyScore,
      success: result.success,
      service: 'metrics'
    });

    return metricsResult;
  }

  /**
   * Generate daily metrics report
   */
  public async generateDailyReport(date: Date = new Date()): Promise<MetricsAggregation> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    return this.metricsCollector.generateAggregatedReport(startDate, endDate, 'day');
  }

  /**
   * Generate weekly metrics report
   */
  public async generateWeeklyReport(weekStartDate: Date): Promise<MetricsAggregation> {
    const startDate = new Date(weekStartDate);
    const endDate = new Date(weekStartDate);
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return this.metricsCollector.generateAggregatedReport(startDate, endDate, 'week');
  }

  /**
   * Get client-specific metrics
   */
  public async getClientMetrics(
    clientId: number,
    startDate: Date,
    endDate: Date
  ): Promise<BaseMetricsResult[]> {
    const allMetrics = this.metricsCollector.getMetricsForPeriod(startDate, endDate);
    return allMetrics.filter(metric => metric.clientId === clientId);
  }

  /**
   * Get platform performance comparison
   */
  public async getPlatformComparison(
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, {
    avgResponseTime: number;
    avgRelevanceScore: number;
    avgAccuracyScore: number;
    successRate: number;
    totalQueries: number;
    avgCost: number;
  }>> {
    const platforms = ['chatgpt', 'gemini', 'claude', 'perplexity', 'grok'];
    const comparison: Record<string, any> = {};

    for (const platform of platforms) {
      const platformMetrics = this.metricsCollector.getMetricsForPeriod(startDate, endDate, platform);
      
      if (platformMetrics.length > 0) {
        const successful = platformMetrics.filter(m => m.success);
        const avgResponseTime = platformMetrics.reduce((sum, m) => sum + m.responseTime, 0) / platformMetrics.length;
        const avgRelevanceScore = successful.length > 0 
          ? successful.reduce((sum, m) => sum + m.relevanceScore, 0) / successful.length 
          : 0;
        const avgAccuracyScore = successful.length > 0
          ? successful.reduce((sum, m) => sum + m.accuracyScore, 0) / successful.length
          : 0;
        const successRate = successful.length / platformMetrics.length;
        const avgCost = platformMetrics.reduce((sum, m) => sum + (m.costEstimate || 0), 0) / platformMetrics.length;

        comparison[platform] = {
          avgResponseTime,
          avgRelevanceScore,
          avgAccuracyScore,
          successRate,
          totalQueries: platformMetrics.length,
          avgCost,
        };
      }
    }

    return comparison;
  }

  /**
   * Export metrics data
   */
  public async exportMetrics(
    startDate: Date,
    endDate: Date,
    format: 'csv' | 'json' = 'csv'
  ): Promise<string> {
    if (format === 'csv') {
      return this.metricsCollector.exportToCSV(startDate, endDate);
    } else {
      const metrics = this.metricsCollector.getMetricsForPeriod(startDate, endDate);
      return JSON.stringify(metrics, null, 2);
    }
  }

  /**
   * Get system health metrics
   */
  public getSystemHealthMetrics(): {
    activeQueries: number;
    metricsRetentionStatus: string;
    averageResponseTime24h: number;
    errorRate24h: number;
    systemLoad: string;
  } {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const last24hMetrics = this.metricsCollector.getMetricsForPeriod(yesterday, now);
    const successful = last24hMetrics.filter(m => m.success);
    
    const averageResponseTime24h = last24hMetrics.length > 0
      ? last24hMetrics.reduce((sum, m) => sum + m.responseTime, 0) / last24hMetrics.length
      : 0;
      
    const errorRate24h = last24hMetrics.length > 0
      ? (last24hMetrics.length - successful.length) / last24hMetrics.length
      : 0;

    return {
      activeQueries: this.activeQueries.size,
      metricsRetentionStatus: 'active',
      averageResponseTime24h,
      errorRate24h,
      systemLoad: this.calculateSystemLoad(),
    };
  }

  /**
   * Private helper methods
   */
  private countKeywordMatches(query: string, response: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const responseWords = response.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const word of queryWords) {
      if (responseWords.some(rWord => rWord.includes(word))) {
        matches++;
      }
    }
    return matches;
  }

  private async storeMetricsInDatabase(metrics: BaseMetricsResult): Promise<void> {
    try {
      // In a real implementation, this would store to the database
      // For now, we'll log it as a placeholder
      logger.info('Storing metrics in database', {
        queryId: metrics.queryId,
        platform: metrics.platform,
        success: metrics.success,
        service: 'metrics-db'
      });
    } catch (error: any) {
      logger.error('Failed to store metrics in database', {
        error: error.message,
        queryId: metrics.queryId,
        service: 'metrics-db'
      });
    }
  }

  private async performRealTimeAnalysis(metrics: BaseMetricsResult): Promise<void> {
    // Alert if response time is unusually high
    if (metrics.responseTime > 10000) { // 10 seconds
      logger.warn('High response time detected', {
        queryId: metrics.queryId,
        platform: metrics.platform,
        responseTime: metrics.responseTime,
        service: 'metrics-analysis'
      });
    }

    // Alert if relevance score is very low
    if (metrics.success && metrics.relevanceScore < 0.3) {
      logger.warn('Low relevance score detected', {
        queryId: metrics.queryId,
        platform: metrics.platform,
        relevanceScore: metrics.relevanceScore,
        service: 'metrics-analysis'
      });
    }

    // Alert if query failed
    if (!metrics.success) {
      logger.error('Query execution failed', {
        queryId: metrics.queryId,
        platform: metrics.platform,
        errorCode: metrics.errorCode,
        errorMessage: metrics.errorMessage,
        service: 'metrics-analysis'
      });
    }
  }

  private calculateSystemLoad(): string {
    const activeCount = this.activeQueries.size;
    if (activeCount === 0) return 'idle';
    if (activeCount <= 5) return 'low';
    if (activeCount <= 20) return 'medium';
    return 'high';
  }
}