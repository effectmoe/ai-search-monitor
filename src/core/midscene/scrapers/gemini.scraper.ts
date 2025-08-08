import { BaseScraper, ScrapeResult } from './base.scraper';
import { logger } from '../../../utils/logger';

export class GeminiScraper extends BaseScraper {
  private readonly GEMINI_URL = 'https://gemini.google.com';
  
  constructor(config?: any) {
    super('Gemini', config);
  }
  
  protected async navigateToPlatform(): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    logger.info('Navigating to Gemini');
    await this.page.goto(this.GEMINI_URL, {
      waitUntil: 'networkidle',
      timeout: this.config.timeout,
    });
    
    await this.page.waitForLoadState('domcontentloaded');
    
    // Handle cookie consent if needed
    await this.handleCookieConsent();
  }
  
  private async handleCookieConsent(): Promise<void> {
    try {
      const hasCookieDialog = await this.aiExists('Cookie consent dialog or Accept cookies button');
      if (hasCookieDialog) {
        await this.aiInteract('Click Accept all or Accept cookies button');
        await this.page!.waitForTimeout(1000);
      }
    } catch (error) {
      logger.debug('No cookie consent dialog found or already accepted');
    }
  }
  
  protected async handleAuthentication(): Promise<void> {
    // Check if login is required
    const isLoggedIn = await this.aiExists('Chat interface or prompt input field');
    
    if (!isLoggedIn) {
      logger.warn('Gemini may require Google account authentication');
      // Authentication would be handled through Google OAuth in production
    }
  }
  
  protected async performSearch(keyword: string): Promise<void> {
    logger.info(`Performing Gemini search for: ${keyword}`);
    
    try {
      // Check for new chat button
      const hasNewChatButton = await this.aiExists('New chat or Start new conversation button');
      if (hasNewChatButton) {
        await this.aiInteract('Click New chat or Start new conversation button');
        await this.page!.waitForTimeout(1000);
      }
      
      // Type in the prompt field
      await this.aiInteract(`Type "${keyword}" in the prompt or message input field`);
      
      // Submit the query
      await this.aiInteract('Click send button or press Enter to submit');
      
      logger.info('Search query submitted to Gemini');
      
    } catch (error: any) {
      logger.error('Failed to perform Gemini search', {
        keyword,
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async waitForResults(): Promise<void> {
    logger.info('Waiting for Gemini response');
    
    try {
      // Wait for response to complete
      await this.waitFor(
        async () => {
          // Check if response is complete
          const hasResponse = await this.aiExists('Gemini response text or message');
          const isGenerating = await this.aiExists('Generating indicator or typing animation');
          return hasResponse && !isGenerating;
        },
        { timeout: 45000, interval: 1500 }
      );
      
      // Additional wait for any formatting to complete
      await this.page!.waitForTimeout(2000);
      
      logger.info('Gemini response received');
      
    } catch (error: any) {
      logger.error('Timeout waiting for Gemini response', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async extractContent(): Promise<any> {
    logger.info('Extracting content from Gemini');
    
    try {
      // Extract the main response
      const response = await this.aiExtract(
        'Extract the complete Gemini response including all text, code blocks, and formatted content'
      );
      
      // Extract any draft variations if available
      const drafts = await this.aiExtract(
        'Extract any alternative draft responses or variations if shown'
      );
      
      // Extract response metadata
      const metadata = await this.aiExtract(
        'Extract any visible metadata like response time or model information'
      );
      
      return {
        response,
        drafts: drafts || [],
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
      };
      
    } catch (error: any) {
      logger.error('Failed to extract Gemini content', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async parseResult(content: any, keyword: string): Promise<ScrapeResult> {
    logger.info('Parsing Gemini result');
    
    try {
      const response = content.response || '';
      
      // Extract mentions and entities
      const mentions = this.extractEntitiesAndMentions(response);
      
      // Analyze sentiment and tone
      const sentiment = this.analyzeResponseTone(response);
      
      // Process any drafts
      const draftAnalysis = content.drafts?.length > 0 
        ? this.analyzeDrafts(content.drafts)
        : null;
      
      return {
        response,
        mentions,
        sentiment,
        metadata: {
          platform: 'Gemini',
          keyword,
          extractedAt: content.timestamp,
          responseLength: response.length,
          draftsCount: content.drafts?.length || 0,
          draftAnalysis,
          ...content.metadata,
        },
      };
      
    } catch (error: any) {
      logger.error('Failed to parse Gemini result', {
        error: error.message,
      });
      throw error;
    }
  }
  
  private extractEntitiesAndMentions(text: string): any[] {
    const mentions = [];
    
    // Extract entities with patterns
    const patterns = {
      companies: /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|Corp|LLC|Ltd|Co|Company)\.?))\b/g,
      products: /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Pro|Plus|Max|Ultra|Premium)))\b/g,
      features: /(?:features?|includes?|offers?|provides?)\s+([^,.]+)/gi,
      comparisons: /(?:compared to|versus|vs\.?|better than|worse than)\s+([^,.]+)/gi,
    };
    
    for (const [type, pattern] of Object.entries(patterns)) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const entity = match[1] || match[0];
        mentions.push({
          type,
          text: entity.trim(),
          position: match.index,
          context: text.substring(
            Math.max(0, match.index - 75),
            Math.min(text.length, match.index + entity.length + 75)
          ),
        });
      }
    }
    
    // Extract Japanese entities
    const japanesePatterns = {
      companies: /(?:株式会社|有限会社|合同会社)([^、。\s]+)/g,
      products: /「([^」]+)」/g,
    };
    
    for (const [type, pattern] of Object.entries(japanesePatterns)) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        mentions.push({
          type,
          text: match[1] || match[0],
          position: match.index,
          language: 'ja',
          context: text.substring(
            Math.max(0, match.index - 50),
            Math.min(text.length, match.index + match[0].length + 50)
          ),
        });
      }
    }
    
    return mentions;
  }
  
  private analyzeResponseTone(text: string): any {
    // Analyze the tone and sentiment of the response
    const toneIndicators = {
      confident: [
        /definitely/gi,
        /certainly/gi,
        /undoubtedly/gi,
        /clearly/gi,
        /obviously/gi,
        /確実に/g,
        /明らかに/g,
        /間違いなく/g,
      ],
      uncertain: [
        /might be/gi,
        /could be/gi,
        /possibly/gi,
        /perhaps/gi,
        /may vary/gi,
        /かもしれない/g,
        /可能性がある/g,
        /おそらく/g,
      ],
      comparative: [
        /better than/gi,
        /worse than/gi,
        /compared to/gi,
        /in contrast/gi,
        /より良い/g,
        /より悪い/g,
        /と比較して/g,
      ],
      recommendatory: [
        /recommend/gi,
        /suggest/gi,
        /advise/gi,
        /should consider/gi,
        /お勧め/g,
        /提案/g,
        /推奨/g,
      ],
    };
    
    const toneScores: Record<string, number> = {};
    
    for (const [tone, patterns] of Object.entries(toneIndicators)) {
      toneScores[tone] = 0;
      patterns.forEach(pattern => {
        const matches = text.match(pattern);
        toneScores[tone] += matches ? matches.length : 0;
      });
    }
    
    // Calculate overall sentiment
    const positiveWords = text.match(/good|great|excellent|best|optimal|優れ|良い|最高|最適/gi);
    const negativeWords = text.match(/bad|poor|worst|issue|problem|悪い|問題|課題|欠点/gi);
    
    const positiveCount = positiveWords ? positiveWords.length : 0;
    const negativeCount = negativeWords ? negativeWords.length : 0;
    
    const sentimentScore = positiveCount + negativeCount > 0
      ? (positiveCount - negativeCount) / (positiveCount + negativeCount)
      : 0;
    
    return {
      score: sentimentScore,
      positive: positiveCount,
      negative: negativeCount,
      label: sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral',
      tones: toneScores,
      dominantTone: Object.entries(toneScores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral',
    };
  }
  
  private analyzeDrafts(drafts: any[]): any {
    if (!drafts || drafts.length === 0) {
      return null;
    }
    
    // Analyze consistency across drafts
    const sentiments = drafts.map(draft => 
      this.analyzeResponseTone(draft)
    );
    
    const avgSentiment = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length;
    const variance = sentiments.reduce((sum, s) => 
      sum + Math.pow(s.score - avgSentiment, 2), 0
    ) / sentiments.length;
    
    return {
      count: drafts.length,
      averageSentiment: avgSentiment,
      sentimentVariance: variance,
      consistency: variance < 0.1 ? 'high' : variance < 0.3 ? 'medium' : 'low',
    };
  }
}