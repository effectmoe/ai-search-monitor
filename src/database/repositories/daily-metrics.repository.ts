import { BaseRepository } from './base.repository';
import { logger } from '../../utils/logger';

export interface DailyMetrics {
  id?: number;
  client_id: number;
  date: string;
  platform: string;
  total_searches: number;
  successful_searches: number;
  failed_searches: number;
  average_visibility_score?: number;
  average_sentiment_score?: number;
  total_brand_mentions: number;
  total_competitor_mentions: number;
}

export class DailyMetricsRepository extends BaseRepository<DailyMetrics> {
  constructor() {
    super('daily_metrics');
  }
  
  /**
   * Update daily metrics
   */
  async updateMetrics(
    clientId: number,
    platform: string,
    date: Date,
    metrics: Partial<DailyMetrics>
  ): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    
    // Check if metrics exist for this date
    const existing = await this.findOneWhere({
      client_id: clientId,
      platform,
      date: dateStr,
    });
    
    if (existing) {
      // Update existing metrics
      const sql = `
        UPDATE daily_metrics 
        SET total_searches = total_searches + ?,
            successful_searches = successful_searches + ?,
            failed_searches = failed_searches + ?,
            average_visibility_score = 
              CASE 
                WHEN average_visibility_score IS NULL THEN ?
                ELSE (average_visibility_score * total_searches + ? * ?) / (total_searches + ?)
              END,
            average_sentiment_score = 
              CASE 
                WHEN average_sentiment_score IS NULL THEN ?
                ELSE (average_sentiment_score * total_searches + ? * ?) / (total_searches + ?)
              END,
            total_brand_mentions = total_brand_mentions + ?,
            total_competitor_mentions = total_competitor_mentions + ?
        WHERE client_id = ? AND platform = ? AND date = ?
      `;
      
      await this.execute(sql, [
        metrics.total_searches || 1,
        metrics.successful_searches || 0,
        metrics.failed_searches || 0,
        metrics.average_visibility_score || 0,
        metrics.average_visibility_score || 0,
        metrics.total_searches || 1,
        metrics.total_searches || 1,
        metrics.average_sentiment_score || 0,
        metrics.average_sentiment_score || 0,
        metrics.total_searches || 1,
        metrics.total_searches || 1,
        metrics.total_brand_mentions || 0,
        metrics.total_competitor_mentions || 0,
        clientId,
        platform,
        dateStr,
      ]);
    } else {
      // Insert new metrics
      await this.insert({
        client_id: clientId,
        date: dateStr,
        platform,
        total_searches: metrics.total_searches || 1,
        successful_searches: metrics.successful_searches || 0,
        failed_searches: metrics.failed_searches || 0,
        average_visibility_score: metrics.average_visibility_score,
        average_sentiment_score: metrics.average_sentiment_score,
        total_brand_mentions: metrics.total_brand_mentions || 0,
        total_competitor_mentions: metrics.total_competitor_mentions || 0,
      });
    }
  }
  
  /**
   * Get metrics for date range
   */
  async getMetricsForDateRange(
    clientId: number,
    startDate: Date,
    endDate: Date,
    platform?: string
  ): Promise<DailyMetrics[]> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    let sql = `
      SELECT * FROM daily_metrics
      WHERE client_id = ?
      AND date BETWEEN ? AND ?
    `;
    
    const params: any[] = [clientId, startStr, endStr];
    
    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }
    
    sql += ' ORDER BY date DESC';
    
    return this.raw(sql, params);
  }
  
  /**
   * Get aggregated metrics for client
   */
  async getAggregatedMetrics(
    clientId: number,
    days: number = 30
  ): Promise<any> {
    const sql = `
      SELECT 
        platform,
        COUNT(DISTINCT date) as days_monitored,
        SUM(total_searches) as total_searches,
        SUM(successful_searches) as successful_searches,
        SUM(failed_searches) as failed_searches,
        AVG(average_visibility_score) as avg_visibility,
        AVG(average_sentiment_score) as avg_sentiment,
        SUM(total_brand_mentions) as total_brand_mentions,
        SUM(total_competitor_mentions) as total_competitor_mentions,
        MAX(date) as last_monitored
      FROM daily_metrics
      WHERE client_id = ?
      AND date >= date('now', '-' || ? || ' days')
      GROUP BY platform
    `;
    
    return this.raw(sql, [clientId, days]);
  }
  
  /**
   * Get trend data for client
   */
  async getTrendData(
    clientId: number,
    metric: 'visibility' | 'sentiment' | 'mentions',
    days: number = 7
  ): Promise<any[]> {
    let metricColumn: string;
    
    switch (metric) {
      case 'visibility':
        metricColumn = 'average_visibility_score';
        break;
      case 'sentiment':
        metricColumn = 'average_sentiment_score';
        break;
      case 'mentions':
        metricColumn = 'total_brand_mentions';
        break;
      default:
        throw new Error(`Invalid metric: ${metric}`);
    }
    
    const sql = `
      SELECT 
        date,
        platform,
        ${metricColumn} as value
      FROM daily_metrics
      WHERE client_id = ?
      AND date >= date('now', '-' || ? || ' days')
      ORDER BY date, platform
    `;
    
    return this.raw(sql, [clientId, days]);
  }
  
  /**
   * Get platform comparison
   */
  async getPlatformComparison(clientId: number, date?: Date): Promise<any[]> {
    const dateStr = date ? date.toISOString().split('T')[0] : 
                   new Date().toISOString().split('T')[0];
    
    const sql = `
      SELECT 
        platform,
        total_searches,
        successful_searches,
        average_visibility_score,
        average_sentiment_score,
        total_brand_mentions,
        total_competitor_mentions
      FROM daily_metrics
      WHERE client_id = ?
      AND date = ?
      ORDER BY average_visibility_score DESC
    `;
    
    return this.raw(sql, [clientId, dateStr]);
  }
  
  /**
   * Get top performing platforms
   */
  async getTopPerformingPlatforms(
    clientId: number,
    limit: number = 3
  ): Promise<any[]> {
    const sql = `
      SELECT 
        platform,
        AVG(average_visibility_score) as avg_visibility,
        AVG(average_sentiment_score) as avg_sentiment,
        SUM(total_brand_mentions) as total_mentions,
        COUNT(DISTINCT date) as days_active
      FROM daily_metrics
      WHERE client_id = ?
      AND date >= date('now', '-30 days')
      GROUP BY platform
      ORDER BY avg_visibility DESC
      LIMIT ?
    `;
    
    return this.raw(sql, [clientId, limit]);
  }
  
  /**
   * Clean up old metrics
   */
  async cleanupOldMetrics(days: number = 90): Promise<number> {
    const sql = `
      DELETE FROM daily_metrics
      WHERE date < date('now', '-' || ? || ' days')
    `;
    
    const result = await this.execute(sql, [days]);
    
    logger.info(`Cleaned up ${result.changes} old metric records`);
    
    return result.changes;
  }
}

// Export singleton instance
export const dailyMetricsRepository = new DailyMetricsRepository();