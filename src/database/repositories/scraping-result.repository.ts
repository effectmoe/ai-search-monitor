import { BaseRepository } from './base.repository';
import { logger } from '../../utils/logger';

export interface ScrapingResult {
  id?: number;
  session_id: string;
  client_id: number;
  platform: string;
  keyword: string;
  response_text?: string;
  response_length?: number;
  screenshot_path?: string;
  execution_time_ms?: number;
  success: boolean;
  error_message?: string;
  scraped_at?: Date;
}

export interface BrandMention {
  id?: number;
  result_id: number;
  client_id: number;
  brand_name: string;
  mention_count: number;
  positions?: string | any[];
  contexts?: string | any[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  strength?: number;
}

export interface CompetitorMention {
  id?: number;
  result_id: number;
  client_id: number;
  competitor_name: string;
  mention_count: number;
  positions?: string | any[];
  comparison_context?: string;
}

export interface SentimentAnalysis {
  id?: number;
  result_id: number;
  overall_sentiment: 'positive' | 'neutral' | 'negative';
  sentiment_score: number;
  positive_ratio: number;
  neutral_ratio: number;
  negative_ratio: number;
  confidence?: number;
}

export interface VisibilityScore {
  id?: number;
  result_id: number;
  client_id: number;
  platform: string;
  total_score: number;
  mention_score: number;
  position_score: number;
  sentiment_score: number;
  competitor_comparison_score: number;
  calculated_at?: Date;
}

export class ScrapingResultRepository extends BaseRepository<ScrapingResult> {
  constructor() {
    super('scraping_results');
  }
  
  /**
   * Save scraping result with all related data
   */
  async saveResult(
    result: ScrapingResult,
    analysis?: {
      brandMentions?: any[];
      competitorMentions?: any[];
      sentiment?: any;
      position?: any;
      visibility?: any;
      recommendations?: string[];
    }
  ): Promise<number> {
    return this.transaction(() => {
      // Insert main result
      const resultId = this.insert({
        ...result,
        response_length: result.response_text?.length || 0,
        success: result.success ? 1 : 0,
      });
      
      if (analysis) {
        // Save brand mentions
        if (analysis.brandMentions && analysis.brandMentions.length > 0) {
          this.saveBrandMentions(resultId, result.client_id, analysis.brandMentions);
        }
        
        // Save competitor mentions
        if (analysis.competitorMentions && analysis.competitorMentions.length > 0) {
          this.saveCompetitorMentions(resultId, result.client_id, analysis.competitorMentions);
        }
        
        // Save sentiment analysis
        if (analysis.sentiment) {
          this.saveSentimentAnalysis(resultId, analysis.sentiment);
        }
        
        // Save position analysis
        if (analysis.position) {
          this.savePositionAnalysis(resultId, analysis.position);
        }
        
        // Save visibility score
        if (analysis.visibility) {
          this.saveVisibilityScore(
            resultId,
            result.client_id,
            result.platform,
            analysis.visibility
          );
        }
        
        // Save recommendations
        if (analysis.recommendations && analysis.recommendations.length > 0) {
          this.saveRecommendations(resultId, result.client_id, analysis.recommendations);
        }
      }
      
      return resultId;
    });
  }
  
  /**
   * Save brand mentions
   */
  private saveBrandMentions(resultId: number, clientId: number, mentions: any[]): void {
    const sql = `
      INSERT INTO brand_mentions 
      (result_id, client_id, brand_name, mention_count, positions, contexts, sentiment, strength)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    for (const mention of mentions) {
      this.execute(sql, [
        resultId,
        clientId,
        mention.brand,
        mention.count,
        JSON.stringify(mention.positions || []),
        JSON.stringify(mention.contexts || []),
        mention.sentiment,
        mention.strength || 0.5,
      ]);
    }
  }
  
  /**
   * Save competitor mentions
   */
  private saveCompetitorMentions(resultId: number, clientId: number, mentions: any[]): void {
    const sql = `
      INSERT INTO competitor_mentions 
      (result_id, client_id, competitor_name, mention_count, positions, comparison_context)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    for (const mention of mentions) {
      this.execute(sql, [
        resultId,
        clientId,
        mention.competitor,
        mention.count,
        JSON.stringify(mention.positions || []),
        mention.comparisonContext,
      ]);
    }
  }
  
  /**
   * Save sentiment analysis
   */
  private saveSentimentAnalysis(resultId: number, sentiment: any): void {
    const sql = `
      INSERT INTO sentiment_analysis 
      (result_id, overall_sentiment, sentiment_score, positive_ratio, neutral_ratio, negative_ratio, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    this.execute(sql, [
      resultId,
      sentiment.overall,
      sentiment.score,
      sentiment.breakdown?.positive || 0,
      sentiment.breakdown?.neutral || 0,
      sentiment.breakdown?.negative || 0,
      sentiment.confidence || 0,
    ]);
  }
  
  /**
   * Save position analysis
   */
  private savePositionAnalysis(resultId: number, position: any): void {
    const sql = `
      INSERT INTO position_analysis 
      (result_id, average_position, first_mention_position, last_mention_position, relative_position)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    this.execute(sql, [
      resultId,
      position.averagePosition,
      position.firstMentionPosition,
      position.lastMentionPosition,
      position.relativePosition,
    ]);
  }
  
  /**
   * Save visibility score
   */
  private saveVisibilityScore(
    resultId: number,
    clientId: number,
    platform: string,
    visibility: any
  ): void {
    const sql = `
      INSERT INTO visibility_scores 
      (result_id, client_id, platform, total_score, mention_score, position_score, sentiment_score, competitor_comparison_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    this.execute(sql, [
      resultId,
      clientId,
      platform,
      visibility.score,
      visibility.factors?.mentionCount || 0,
      visibility.factors?.positionScore || 0,
      visibility.factors?.sentimentScore || 0,
      visibility.factors?.competitorComparison || 0,
    ]);
  }
  
  /**
   * Save recommendations
   */
  private saveRecommendations(
    resultId: number,
    clientId: number,
    recommendations: string[]
  ): void {
    const sql = `
      INSERT INTO recommendations 
      (result_id, client_id, recommendation_text, priority, category)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    for (const recommendation of recommendations) {
      // Determine priority and category based on content
      let priority = 'medium';
      let category = 'visibility';
      
      if (recommendation.toLowerCase().includes('critical') || 
          recommendation.toLowerCase().includes('urgent')) {
        priority = 'high';
        category = 'critical';
      } else if (recommendation.toLowerCase().includes('position')) {
        category = 'positioning';
      } else if (recommendation.toLowerCase().includes('sentiment') || 
                 recommendation.toLowerCase().includes('negative')) {
        category = 'sentiment';
      } else if (recommendation.toLowerCase().includes('competitor')) {
        category = 'competition';
      }
      
      this.execute(sql, [
        resultId,
        clientId,
        recommendation,
        priority,
        category,
      ]);
    }
  }
  
  /**
   * Get results by session
   */
  async getResultsBySession(sessionId: string): Promise<ScrapingResult[]> {
    return this.findWhere({ session_id: sessionId }, {
      orderBy: 'scraped_at',
      order: 'DESC',
    });
  }
  
  /**
   * Get results by client and date range
   */
  async getResultsByClientAndDateRange(
    clientId: number,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    const sql = `
      SELECT 
        sr.*,
        sa.overall_sentiment,
        sa.sentiment_score,
        vs.total_score as visibility_score
      FROM scraping_results sr
      LEFT JOIN sentiment_analysis sa ON sr.id = sa.result_id
      LEFT JOIN visibility_scores vs ON sr.id = vs.result_id
      WHERE sr.client_id = ?
      AND sr.scraped_at BETWEEN ? AND ?
      ORDER BY sr.scraped_at DESC
    `;
    
    return this.raw(sql, [clientId, startDate.toISOString(), endDate.toISOString()]);
  }
  
  /**
   * Get latest results for client
   */
  async getLatestResultsForClient(clientId: number, limit: number = 10): Promise<any[]> {
    const sql = `
      SELECT 
        sr.*,
        sa.overall_sentiment,
        sa.sentiment_score,
        vs.total_score as visibility_score,
        GROUP_CONCAT(DISTINCT bm.brand_name) as mentioned_brands,
        GROUP_CONCAT(DISTINCT cm.competitor_name) as mentioned_competitors
      FROM scraping_results sr
      LEFT JOIN sentiment_analysis sa ON sr.id = sa.result_id
      LEFT JOIN visibility_scores vs ON sr.id = vs.result_id
      LEFT JOIN brand_mentions bm ON sr.id = bm.result_id
      LEFT JOIN competitor_mentions cm ON sr.id = cm.result_id
      WHERE sr.client_id = ?
      GROUP BY sr.id
      ORDER BY sr.scraped_at DESC
      LIMIT ?
    `;
    
    return this.raw(sql, [clientId, limit]);
  }
  
  /**
   * Get platform performance stats
   */
  async getPlatformStats(platform: string, days: number = 7): Promise<any> {
    const sql = `
      SELECT 
        COUNT(*) as total_scrapes,
        COUNT(CASE WHEN success = 1 THEN 1 END) as successful_scrapes,
        COUNT(CASE WHEN success = 0 THEN 1 END) as failed_scrapes,
        AVG(execution_time_ms) as avg_execution_time,
        MIN(scraped_at) as first_scrape,
        MAX(scraped_at) as last_scrape
      FROM scraping_results
      WHERE platform = ?
      AND scraped_at >= datetime('now', '-' || ? || ' days')
    `;
    
    return this.rawOne(sql, [platform, days]);
  }
}

// Export singleton instance
export const scrapingResultRepository = new ScrapingResultRepository();