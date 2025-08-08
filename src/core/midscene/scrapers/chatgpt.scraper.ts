import { BaseScraper, ScrapeResult } from './base.scraper';
import { logger } from '../../../utils/logger';

export class ChatGPTScraper extends BaseScraper {
  private readonly CHATGPT_URL = 'https://chat.openai.com';
  
  constructor(config?: any) {
    super('ChatGPT', config);
  }
  
  protected async navigateToPlatform(): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    logger.info('Navigating to ChatGPT');
    await this.page.goto(this.CHATGPT_URL, {
      waitUntil: 'networkidle',
      timeout: this.config.timeout,
    });
    
    // Wait for page to be ready
    await this.page.waitForLoadState('domcontentloaded');
  }
  
  protected async handleAuthentication(): Promise<void> {
    // Check if login is required
    const isLoggedIn = await this.aiExists('New chat button or chat interface');
    
    if (!isLoggedIn) {
      logger.warn('ChatGPT requires authentication - skipping as it requires manual setup');
      // In production, you would handle OAuth or use stored credentials
      // For now, we'll assume the browser has saved login state
    }
  }
  
  protected async performSearch(keyword: string): Promise<void> {
    logger.info(`Performing ChatGPT search for: ${keyword}`);
    
    try {
      // Click on new chat if needed
      const hasNewChatButton = await this.aiExists('New chat button');
      if (hasNewChatButton) {
        await this.aiInteract('Click the New chat button');
        await this.page!.waitForTimeout(1000);
      }
      
      // Find and interact with the input field
      await this.aiInteract(`Type "${keyword}" in the message input field`);
      
      // Submit the query
      await this.aiInteract('Click the send button or press Enter');
      
      logger.info('Search query submitted to ChatGPT');
      
    } catch (error: any) {
      logger.error('Failed to perform ChatGPT search', {
        keyword,
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async waitForResults(): Promise<void> {
    logger.info('Waiting for ChatGPT response');
    
    try {
      // Wait for response to start appearing
      await this.waitFor(
        async () => {
          // Check if response is being generated
          const isGenerating = await this.aiExists('Stop generating button or regenerate button');
          const hasResponse = await this.aiExists('ChatGPT response message');
          return !isGenerating && hasResponse;
        },
        { timeout: 60000, interval: 2000 }
      );
      
      // Additional wait for complete response
      await this.page!.waitForTimeout(2000);
      
      logger.info('ChatGPT response received');
      
    } catch (error: any) {
      logger.error('Timeout waiting for ChatGPT response', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async extractContent(): Promise<any> {
    logger.info('Extracting content from ChatGPT');
    
    try {
      // Extract the response using Midscene AI
      const content = await this.aiExtract(
        'Extract the complete ChatGPT response text including any code blocks, lists, or formatted content'
      );
      
      // Also extract metadata if available
      const metadata = await this.aiExtract(
        'Extract any visible metadata like response time, model version, or tokens used if shown'
      );
      
      return {
        response: content,
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
      };
      
    } catch (error: any) {
      logger.error('Failed to extract ChatGPT content', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async parseResult(content: any, keyword: string): Promise<ScrapeResult> {
    logger.info('Parsing ChatGPT result');
    
    try {
      const response = content.response || '';
      
      // Basic parsing - can be enhanced with NLP
      const mentions = this.extractMentions(response);
      const sentiment = this.analyzeSentiment(response);
      
      return {
        response,
        mentions,
        sentiment,
        metadata: {
          ...content.metadata,
          platform: 'ChatGPT',
          keyword,
          extractedAt: content.timestamp,
          responseLength: response.length,
        },
      };
      
    } catch (error: any) {
      logger.error('Failed to parse ChatGPT result', {
        error: error.message,
      });
      throw error;
    }
  }
  
  private extractMentions(text: string): any[] {
    const mentions = [];
    
    // Look for brand/product mentions (simplified - should use NER in production)
    const patterns = [
      /\b(?:について|に関して|という|と呼ばれる)\s*「?([^」\n]+)」?/g,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, // Capitalized words
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
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
    // Simplified sentiment analysis
    const positiveWords = [
      'excellent', 'great', 'good', 'best', 'recommended',
      '優れ', '良い', 'おすすめ', '最高', '素晴らしい'
    ];
    
    const negativeWords = [
      'bad', 'poor', 'worst', 'not recommended', 'avoid',
      '悪い', '良くない', '避ける', '問題', '欠点'
    ];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    const lowerText = text.toLowerCase();
    
    positiveWords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      const matches = lowerText.match(regex);
      positiveCount += matches ? matches.length : 0;
    });
    
    negativeWords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      const matches = lowerText.match(regex);
      negativeCount += matches ? matches.length : 0;
    });
    
    const total = positiveCount + negativeCount;
    const score = total > 0 ? (positiveCount - negativeCount) / total : 0;
    
    return {
      score,
      positive: positiveCount,
      negative: negativeCount,
      neutral: total === 0,
      label: score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral',
    };
  }
}