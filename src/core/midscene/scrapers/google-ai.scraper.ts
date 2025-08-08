import { BaseScraper, ScrapeResult } from './base.scraper';
import { logger } from '../../../utils/logger';

export class GoogleAIScraper extends BaseScraper {
  private readonly GOOGLE_SEARCH_URL = 'https://www.google.com/search';
  
  constructor(config?: any) {
    super('Google-AI-Overview', config);
  }
  
  protected async navigateToPlatform(): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    logger.info('Navigating to Google Search');
    await this.page.goto('https://www.google.com', {
      waitUntil: 'networkidle',
      timeout: this.config.timeout,
    });
    
    await this.page.waitForLoadState('domcontentloaded');
    
    // Handle cookie consent
    await this.handleCookieConsent();
  }
  
  private async handleCookieConsent(): Promise<void> {
    try {
      const hasCookieDialog = await this.aiExists('Cookie consent dialog or Accept all button');
      if (hasCookieDialog) {
        await this.aiInteract('Click Accept all or I agree button');
        await this.page!.waitForTimeout(1000);
      }
    } catch (error) {
      logger.debug('No cookie consent dialog found or already accepted');
    }
  }
  
  protected async performSearch(keyword: string): Promise<void> {
    logger.info(`Performing Google AI Overview search for: ${keyword}`);
    
    try {
      // Type in the search box
      await this.aiInteract(`Type "${keyword}" in the Google search box`);
      
      // Submit the search
      await this.aiInteract('Press Enter or click the Google Search button');
      
      // Wait for search results page to load
      await this.page!.waitForLoadState('networkidle');
      
      logger.info('Search query submitted to Google');
      
    } catch (error: any) {
      logger.error('Failed to perform Google search', {
        keyword,
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async waitForResults(): Promise<void> {
    logger.info('Waiting for Google AI Overview');
    
    try {
      // Check if AI Overview is available
      const hasAIOverview = await this.waitFor(
        async () => {
          // Look for AI Overview section (can have different labels)
          const hasOverview = await this.aiExists(
            'AI Overview section or AI-generated summary or Generative AI response'
          );
          const hasGenerativeAI = await this.aiExists(
            'SGE (Search Generative Experience) section or AI snapshot'
          );
          return hasOverview || hasGenerativeAI;
        },
        { timeout: 15000, interval: 1000 }
      );
      
      if (!hasAIOverview) {
        logger.warn('No AI Overview found for this search - extracting regular results');
      }
      
      // Wait for content to fully load
      await this.page!.waitForTimeout(2000);
      
      logger.info('Google search results ready');
      
    } catch (error: any) {
      logger.warn('AI Overview not found, will extract regular search results', {
        error: error.message,
      });
    }
  }
  
  protected async extractContent(): Promise<any> {
    logger.info('Extracting content from Google');
    
    try {
      // Try to extract AI Overview first
      let aiOverview = null;
      try {
        aiOverview = await this.aiExtract(
          'Extract the AI Overview or AI-generated summary content if present'
        );
      } catch (error) {
        logger.debug('No AI Overview found');
      }
      
      // Extract regular search results
      const searchResults = await this.aiExtract(
        'Extract the top 5 search results including titles, snippets, and URLs'
      );
      
      // Extract People Also Ask section
      const peopleAlsoAsk = await this.aiExtract(
        'Extract the "People also ask" questions and answers if present'
      );
      
      // Extract related searches
      const relatedSearches = await this.aiExtract(
        'Extract the related searches or suggested searches if shown'
      );
      
      // Extract knowledge panel if present
      const knowledgePanel = await this.aiExtract(
        'Extract the knowledge panel or information box content if present on the right side'
      );
      
      return {
        aiOverview,
        searchResults,
        peopleAlsoAsk: peopleAlsoAsk || [],
        relatedSearches: relatedSearches || [],
        knowledgePanel: knowledgePanel || null,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error: any) {
      logger.error('Failed to extract Google content', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async parseResult(content: any, keyword: string): Promise<ScrapeResult> {
    logger.info('Parsing Google result');
    
    try {
      // Combine AI Overview and search results
      const response = this.combineGoogleContent(content);
      
      // Extract mentions from all content
      const mentions = this.extractGoogleMentions(content);
      
      // Analyze sentiment across all content
      const sentiment = this.analyzeGoogleSentiment(content);
      
      // Analyze search result positioning
      const positioning = this.analyzeResultPositioning(content.searchResults);
      
      return {
        response,
        mentions,
        sentiment,
        metadata: {
          platform: 'Google-AI-Overview',
          keyword,
          extractedAt: content.timestamp,
          hasAIOverview: !!content.aiOverview,
          searchResultsCount: content.searchResults?.length || 0,
          peopleAlsoAskCount: content.peopleAlsoAsk?.length || 0,
          relatedSearchesCount: content.relatedSearches?.length || 0,
          hasKnowledgePanel: !!content.knowledgePanel,
          positioning,
        },
      };
      
    } catch (error: any) {
      logger.error('Failed to parse Google result', {
        error: error.message,
      });
      throw error;
    }
  }
  
  private combineGoogleContent(content: any): string {
    const parts = [];
    
    if (content.aiOverview) {
      parts.push('=== AI Overview ===\n' + content.aiOverview);
    }
    
    if (content.searchResults && content.searchResults.length > 0) {
      parts.push('\n=== Search Results ===\n' + 
        (typeof content.searchResults === 'string' 
          ? content.searchResults 
          : JSON.stringify(content.searchResults, null, 2))
      );
    }
    
    if (content.peopleAlsoAsk && content.peopleAlsoAsk.length > 0) {
      parts.push('\n=== People Also Ask ===\n' + 
        (typeof content.peopleAlsoAsk === 'string'
          ? content.peopleAlsoAsk
          : JSON.stringify(content.peopleAlsoAsk, null, 2))
      );
    }
    
    if (content.knowledgePanel) {
      parts.push('\n=== Knowledge Panel ===\n' + content.knowledgePanel);
    }
    
    if (content.relatedSearches && content.relatedSearches.length > 0) {
      parts.push('\n=== Related Searches ===\n' + 
        (typeof content.relatedSearches === 'string'
          ? content.relatedSearches
          : content.relatedSearches.join(', '))
      );
    }
    
    return parts.join('\n');
  }
  
  private extractGoogleMentions(content: any): any[] {
    const mentions = [];
    const processedTexts = new Set();
    
    // Process AI Overview
    if (content.aiOverview) {
      const aiMentions = this.extractMentionsFromText(content.aiOverview, 'ai-overview');
      aiMentions.forEach(m => {
        if (!processedTexts.has(m.text)) {
          mentions.push(m);
          processedTexts.add(m.text);
        }
      });
    }
    
    // Process search results
    if (content.searchResults) {
      const resultsText = typeof content.searchResults === 'string' 
        ? content.searchResults 
        : JSON.stringify(content.searchResults);
      
      const resultMentions = this.extractMentionsFromText(resultsText, 'search-results');
      resultMentions.forEach(m => {
        if (!processedTexts.has(m.text)) {
          mentions.push(m);
          processedTexts.add(m.text);
        }
      });
    }
    
    // Process knowledge panel
    if (content.knowledgePanel) {
      const panelMentions = this.extractMentionsFromText(content.knowledgePanel, 'knowledge-panel');
      panelMentions.forEach(m => {
        if (!processedTexts.has(m.text)) {
          m.priority = 'high'; // Knowledge panel mentions are high priority
          mentions.push(m);
          processedTexts.add(m.text);
        }
      });
    }
    
    return mentions;
  }
  
  private extractMentionsFromText(text: string, source: string): any[] {
    const mentions = [];
    
    // Extract URLs
    const urlPattern = /https?:\/\/[^\s]+/g;
    let match;
    while ((match = urlPattern.exec(text)) !== null) {
      mentions.push({
        type: 'url',
        text: match[0],
        source,
        position: match.index,
      });
    }
    
    // Extract brand/company names
    const brandPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|Corp|LLC|Ltd|Co))?)\.?\b/g;
    while ((match = brandPattern.exec(text)) !== null) {
      if (match[1].length > 2) {
        mentions.push({
          type: 'brand',
          text: match[1],
          source,
          position: match.index,
          context: text.substring(
            Math.max(0, match.index - 50),
            Math.min(text.length, match.index + match[0].length + 50)
          ),
        });
      }
    }
    
    // Extract quoted text (often important)
    const quotePattern = /"([^"]+)"/g;
    while ((match = quotePattern.exec(text)) !== null) {
      mentions.push({
        type: 'quote',
        text: match[1],
        source,
        position: match.index,
      });
    }
    
    return mentions;
  }
  
  private analyzeGoogleSentiment(content: any): any {
    let allText = '';
    
    // Combine all text for sentiment analysis
    if (content.aiOverview) allText += content.aiOverview + ' ';
    if (content.searchResults) {
      allText += typeof content.searchResults === 'string' 
        ? content.searchResults 
        : JSON.stringify(content.searchResults);
    }
    if (content.knowledgePanel) allText += ' ' + content.knowledgePanel;
    
    // Sentiment indicators
    const sentimentPatterns = {
      veryPositive: [
        /highly recommended/gi,
        /best choice/gi,
        /top rated/gi,
        /excellent/gi,
        /outstanding/gi,
      ],
      positive: [
        /recommended/gi,
        /good choice/gi,
        /reliable/gi,
        /trusted/gi,
        /popular/gi,
      ],
      negative: [
        /not recommended/gi,
        /poor quality/gi,
        /issues reported/gi,
        /complaints/gi,
        /problems/gi,
      ],
      veryNegative: [
        /avoid/gi,
        /scam/gi,
        /fraud/gi,
        /terrible/gi,
        /worst/gi,
      ],
    };
    
    const scores = {
      veryPositive: 0,
      positive: 0,
      negative: 0,
      veryNegative: 0,
    };
    
    for (const [level, patterns] of Object.entries(sentimentPatterns)) {
      patterns.forEach(pattern => {
        const matches = allText.match(pattern);
        scores[level as keyof typeof scores] += matches ? matches.length : 0;
      });
    }
    
    // Calculate weighted sentiment score
    const weightedScore = 
      (scores.veryPositive * 2 + scores.positive * 1 - scores.negative * 1 - scores.veryNegative * 2) /
      Math.max(1, scores.veryPositive + scores.positive + scores.negative + scores.veryNegative);
    
    return {
      score: weightedScore,
      breakdown: scores,
      label: weightedScore > 0.5 ? 'very positive' :
             weightedScore > 0.1 ? 'positive' :
             weightedScore < -0.5 ? 'very negative' :
             weightedScore < -0.1 ? 'negative' : 'neutral',
      confidence: Math.abs(weightedScore),
    };
  }
  
  private analyzeResultPositioning(searchResults: any): any {
    if (!searchResults || searchResults.length === 0) {
      return {
        topResults: 0,
        averagePosition: -1,
      };
    }
    
    // Analyze positioning in search results
    const results = Array.isArray(searchResults) ? searchResults : [searchResults];
    
    return {
      topResults: Math.min(3, results.length),
      totalResults: results.length,
      hasRichSnippets: results.some((r: any) => 
        typeof r === 'string' && (r.includes('rating') || r.includes('review'))
      ),
      hasSitelinks: results.some((r: any) => 
        typeof r === 'string' && r.includes('sitelink')
      ),
    };
  }
}