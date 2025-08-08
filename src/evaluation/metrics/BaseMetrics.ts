/**
 * Base metrics collection system for AI Search Monitor
 * Phase 1: Fundamental metrics for response quality and performance
 */

export interface BaseMetricsResult {
  timestamp: string;
  queryId: string;
  platform: string;
  clientId: number;
  
  // Performance metrics
  responseTime: number; // milliseconds
  apiLatency: number;
  processingTime: number;
  
  // Quality metrics  
  relevanceScore: number; // 0-1
  accuracyScore: number; // 0-1
  completenessScore: number; // 0-1
  
  // Content metrics
  responseLength: number;
  keywordMatches: number;
  brandMentions: number;
  
  // Cost metrics
  tokensUsed?: number;
  costEstimate?: number; // in yen
  
  // Technical metrics
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  
  // Additional context
  searchQuery: string;
  expectedResults?: string[];
  actualResult: string;
}

export interface MetricsAggregation {
  period: 'hour' | 'day' | 'week' | 'month';
  startDate: string;
  endDate: string;
  
  // Aggregated performance
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  
  // Aggregated quality
  avgRelevanceScore: number;
  avgAccuracyScore: number;
  avgCompletenessScore: number;
  
  // Volume metrics
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  successRate: number;
  
  // Cost metrics
  totalCost: number;
  avgCostPerQuery: number;
  
  // Platform breakdown
  platformMetrics: Record<string, {
    queries: number;
    avgScore: number;
    avgCost: number;
  }>;
}

export class BaseMetricsCollector {
  private metrics: BaseMetricsResult[] = [];
  
  /**
   * Record a new metric result
   */
  public recordMetric(result: BaseMetricsResult): void {
    this.metrics.push({
      ...result,
      timestamp: new Date().toISOString(),
    });
  }
  
  /**
   * Calculate relevance score based on keyword matching and context
   */
  public calculateRelevanceScore(
    query: string,
    result: string,
    expectedKeywords: string[] = []
  ): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const resultWords = result.toLowerCase().split(/\s+/);
    
    let matches = 0;
    let totalWords = queryWords.length;
    
    // Check query word matches in result
    for (const word of queryWords) {
      if (resultWords.some(rWord => rWord.includes(word) || word.includes(rWord))) {
        matches++;
      }
    }
    
    // Bonus for expected keyword matches
    if (expectedKeywords.length > 0) {
      for (const keyword of expectedKeywords) {
        if (result.toLowerCase().includes(keyword.toLowerCase())) {
          matches += 0.5;
        }
      }
      totalWords += expectedKeywords.length;
    }
    
    return Math.min(matches / totalWords, 1.0);
  }
  
  /**
   * Calculate accuracy score based on factual correctness indicators
   */
  public calculateAccuracyScore(
    result: string,
    brandName: string,
    expectedMentions: string[] = []
  ): number {
    let score = 0.5; // Base score
    
    // Check for brand name mention
    if (result.toLowerCase().includes(brandName.toLowerCase())) {
      score += 0.3;
    }
    
    // Check for expected mentions
    for (const mention of expectedMentions) {
      if (result.toLowerCase().includes(mention.toLowerCase())) {
        score += 0.1;
      }
    }
    
    // Penalty for obvious errors or inconsistencies
    const errorIndicators = [
      'sorry, i don\'t know',
      'i cannot provide',
      'error occurred',
      'information not available'
    ];
    
    for (const indicator of errorIndicators) {
      if (result.toLowerCase().includes(indicator)) {
        score -= 0.2;
        break;
      }
    }
    
    return Math.max(0, Math.min(score, 1.0));
  }
  
  /**
   * Calculate completeness score based on response length and content depth
   */
  public calculateCompletenessScore(result: string, minLength: number = 100): number {
    if (result.length < 10) return 0.0;
    if (result.length >= minLength * 2) return 1.0;
    if (result.length >= minLength) return 0.8;
    if (result.length >= minLength / 2) return 0.6;
    return result.length / minLength;
  }
  
  /**
   * Count brand mentions in result
   */
  public countBrandMentions(result: string, brandVariations: string[]): number {
    let count = 0;
    for (const brand of brandVariations) {
      const regex = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = result.match(regex);
      count += matches ? matches.length : 0;
    }
    return count;
  }
  
  /**
   * Get metrics for a specific time period
   */
  public getMetricsForPeriod(
    startDate: Date,
    endDate: Date,
    platform?: string
  ): BaseMetricsResult[] {
    return this.metrics.filter(metric => {
      const timestamp = new Date(metric.timestamp);
      const withinPeriod = timestamp >= startDate && timestamp <= endDate;
      const platformMatch = !platform || metric.platform === platform;
      return withinPeriod && platformMatch;
    });
  }
  
  /**
   * Generate aggregated metrics report
   */
  public generateAggregatedReport(
    startDate: Date,
    endDate: Date,
    period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): MetricsAggregation {
    const periodMetrics = this.getMetricsForPeriod(startDate, endDate);
    
    if (periodMetrics.length === 0) {
      return {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        avgRelevanceScore: 0,
        avgAccuracyScore: 0,
        avgCompletenessScore: 0,
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        successRate: 0,
        totalCost: 0,
        avgCostPerQuery: 0,
        platformMetrics: {},
      };
    }
    
    const successful = periodMetrics.filter(m => m.success);
    const failed = periodMetrics.filter(m => !m.success);
    
    // Calculate response time stats
    const responseTimes = periodMetrics.map(m => m.responseTime);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);
    
    // Calculate quality scores (only from successful queries)
    const relevanceScores = successful.map(m => m.relevanceScore);
    const accuracyScores = successful.map(m => m.accuracyScore);
    const completenessScores = successful.map(m => m.completenessScore);
    
    const avgRelevanceScore = relevanceScores.length > 0 
      ? relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length 
      : 0;
    const avgAccuracyScore = accuracyScores.length > 0
      ? accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length
      : 0;
    const avgCompletenessScore = completenessScores.length > 0
      ? completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length
      : 0;
    
    // Calculate cost metrics
    const costs = periodMetrics
      .map(m => m.costEstimate || 0)
      .filter(cost => cost > 0);
    const totalCost = costs.reduce((a, b) => a + b, 0);
    const avgCostPerQuery = costs.length > 0 ? totalCost / periodMetrics.length : 0;
    
    // Platform breakdown
    const platformMetrics: Record<string, { queries: number; avgScore: number; avgCost: number }> = {};
    const platforms = [...new Set(periodMetrics.map(m => m.platform))];
    
    for (const platform of platforms) {
      const platformData = periodMetrics.filter(m => m.platform === platform);
      const platformSuccessful = platformData.filter(m => m.success);
      
      const avgScore = platformSuccessful.length > 0
        ? platformSuccessful.reduce((sum, m) => sum + (m.relevanceScore + m.accuracyScore + m.completenessScore) / 3, 0) / platformSuccessful.length
        : 0;
        
      const avgCost = platformData.length > 0
        ? platformData.reduce((sum, m) => sum + (m.costEstimate || 0), 0) / platformData.length
        : 0;
      
      platformMetrics[platform] = {
        queries: platformData.length,
        avgScore,
        avgCost,
      };
    }
    
    return {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      avgRelevanceScore,
      avgAccuracyScore,
      avgCompletenessScore,
      totalQueries: periodMetrics.length,
      successfulQueries: successful.length,
      failedQueries: failed.length,
      successRate: successful.length / periodMetrics.length,
      totalCost,
      avgCostPerQuery,
      platformMetrics,
    };
  }
  
  /**
   * Export metrics as CSV for external analysis
   */
  public exportToCSV(startDate?: Date, endDate?: Date): string {
    const metricsToExport = startDate && endDate 
      ? this.getMetricsForPeriod(startDate, endDate)
      : this.metrics;
    
    if (metricsToExport.length === 0) {
      return 'No data available for the specified period';
    }
    
    // CSV headers
    const headers = [
      'timestamp',
      'queryId',
      'platform',
      'clientId',
      'responseTime',
      'relevanceScore',
      'accuracyScore',
      'completenessScore',
      'responseLength',
      'brandMentions',
      'success',
      'costEstimate',
      'searchQuery'
    ];
    
    // CSV rows
    const rows = metricsToExport.map(metric => [
      metric.timestamp,
      metric.queryId,
      metric.platform,
      metric.clientId,
      metric.responseTime,
      metric.relevanceScore,
      metric.accuracyScore,
      metric.completenessScore,
      metric.responseLength,
      metric.brandMentions,
      metric.success,
      metric.costEstimate || 0,
      `"${metric.searchQuery.replace(/"/g, '""')}"` // Escape quotes in CSV
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}