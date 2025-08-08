import { BaseScraper, ScrapeResult } from './base.scraper';
import { logger } from '../../../utils/logger';

export class PerplexityScraper extends BaseScraper {
  private readonly PERPLEXITY_URL = 'https://www.perplexity.ai';
  
  constructor(config?: any) {
    super('Perplexity', config);
  }
  
  protected async navigateToPlatform(): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    logger.info('Navigating to Perplexity');
    await this.page.goto(this.PERPLEXITY_URL, {
      waitUntil: 'networkidle',
      timeout: this.config.timeout,
    });
    
    await this.page.waitForLoadState('domcontentloaded');
  }
  
  protected async performSearch(keyword: string): Promise<void> {
    logger.info(`Performing Perplexity search for: ${keyword}`);
    
    try {
      // Find the search input
      await this.aiInteract(`Type "${keyword}" in the search or question input field`);
      
      // Submit the search
      await this.aiInteract('Press Enter or click the search/submit button');
      
      logger.info('Search query submitted to Perplexity');
      
    } catch (error: any) {
      logger.error('Failed to perform Perplexity search', {
        keyword,
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async waitForResults(): Promise<void> {
    logger.info('Waiting for Perplexity response');
    
    try {
      // Wait for the response to complete
      await this.waitFor(
        async () => {
          // Check if response is complete
          const hasResponse = await this.aiExists('Answer section with text content');
          const isLoading = await this.aiExists('Loading indicator or spinner');
          return hasResponse && !isLoading;
        },
        { timeout: 45000, interval: 1500 }
      );
      
      // Wait a bit more for any dynamic content
      await this.page!.waitForTimeout(2000);
      
      logger.info('Perplexity response received');
      
    } catch (error: any) {
      logger.error('Timeout waiting for Perplexity response', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async extractContent(): Promise<any> {
    logger.info('Extracting content from Perplexity');
    
    try {
      // Extract the main answer
      const answer = await this.aiExtract(
        'Extract the complete answer text from Perplexity, including all paragraphs and bullet points'
      );
      
      // Extract sources if available
      const sources = await this.aiExtract(
        'Extract all source URLs and citations shown in the response'
      );
      
      // Extract related questions if shown
      const relatedQuestions = await this.aiExtract(
        'Extract any related questions or follow-up suggestions if shown'
      );
      
      return {
        response: answer,
        sources: sources || [],
        relatedQuestions: relatedQuestions || [],
        timestamp: new Date().toISOString(),
      };
      
    } catch (error: any) {
      logger.error('Failed to extract Perplexity content', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async parseResult(content: any, keyword: string): Promise<ScrapeResult> {
    logger.info('Parsing Perplexity result');
    
    try {
      const response = content.response || '';
      
      // Extract mentions with source tracking
      const mentions = this.extractMentionsWithSources(response, content.sources);
      
      // Analyze sentiment
      const sentiment = this.analyzeSentiment(response);
      
      return {
        response,
        mentions,
        sentiment,
        metadata: {
          platform: 'Perplexity',
          keyword,
          extractedAt: content.timestamp,
          responseLength: response.length,
          sourcesCount: content.sources?.length || 0,
          sources: content.sources,
          relatedQuestions: content.relatedQuestions,
        },
      };
      
    } catch (error: any) {
      logger.error('Failed to parse Perplexity result', {
        error: error.message,
      });
      throw error;
    }
  }
  
  private extractMentionsWithSources(text: string, sources: any[]): any[] {
    const mentions = [];
    
    // Look for citations in the text [1], [2], etc.
    const citationPattern = /\[(\d+)\]/g;
    let match;
    
    while ((match = citationPattern.exec(text)) !== null) {
      const citationIndex = parseInt(match[1]) - 1;
      const source = sources && sources[citationIndex] ? sources[citationIndex] : null;
      
      // Extract context around the citation
      const contextStart = Math.max(0, match.index - 100);
      const contextEnd = Math.min(text.length, match.index + 100);
      const context = text.substring(contextStart, contextEnd);
      
      mentions.push({
        citation: match[0],
        position: match.index,
        source: source,
        context: context,
      });
    }
    
    // Also extract brand/product mentions
    const brandPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    
    while ((match = brandPattern.exec(text)) !== null) {
      // Check if this is not already part of a citation
      const isCitation = mentions.some(m => 
        m.position <= match.index && 
        match.index <= m.position + m.citation.length
      );
      
      if (!isCitation && match[1].length > 2) {
        mentions.push({
          text: match[1],
          position: match.index,
          context: text.substring(
            Math.max(0, match.index - 50),
            Math.min(text.length, match.index + match[0].length + 50)
          ),
        });
      }
    }
    
    return mentions;
  }
  
  private analyzeSentiment(text: string): any {
    // Enhanced sentiment analysis for Perplexity responses
    const positivePatterns = [
      /highly recommended/gi,
      /best choice/gi,
      /excellent option/gi,
      /top-rated/gi,
      /leading solution/gi,
      /優れた選択/gi,
      /最適な/gi,
      /高評価/gi,
    ];
    
    const negativePatterns = [
      /not recommended/gi,
      /poor choice/gi,
      /significant issues/gi,
      /major problems/gi,
      /avoid using/gi,
      /推奨されない/gi,
      /問題が多い/gi,
      /避けるべき/gi,
    ];
    
    const neutralPatterns = [
      /depends on/gi,
      /varies by/gi,
      /mixed reviews/gi,
      /場合による/gi,
      /一長一短/gi,
    ];
    
    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;
    
    positivePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      positiveScore += matches ? matches.length * 2 : 0;
    });
    
    negativePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      negativeScore += matches ? matches.length * 2 : 0;
    });
    
    neutralPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      neutralScore += matches ? matches.length : 0;
    });
    
    const total = positiveScore + negativeScore + neutralScore;
    
    if (total === 0) {
      return {
        score: 0,
        label: 'neutral',
        confidence: 0,
      };
    }
    
    const score = (positiveScore - negativeScore) / total;
    const confidence = Math.abs(score) * (1 - neutralScore / total);
    
    return {
      score,
      positive: positiveScore,
      negative: negativeScore,
      neutral: neutralScore,
      label: score > 0.3 ? 'positive' : score < -0.3 ? 'negative' : 'neutral',
      confidence,
    };
  }
}