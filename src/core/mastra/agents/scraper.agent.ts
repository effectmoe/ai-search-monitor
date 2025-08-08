import { createAgent } from '@mastra/core';
import { BaseAgent, BaseAgentConfig } from './base.agent';
import { logger } from '../../../utils/logger';

export interface ScraperInput {
  platform: 'chatgpt' | 'perplexity' | 'gemini' | 'claude' | 'google-ai';
  client: {
    id: number;
    name: string;
    keywords: string[];
    brandNames: string[];
  };
  timeout?: number;
}

export interface ScraperOutput {
  platform: string;
  clientId: number;
  keyword: string;
  response: string;
  mentions: any[];
  sentiment: any;
  screenshot?: string;
  executionTime: number;
  timestamp: Date;
  success: boolean;
}

export class ScraperAgent extends BaseAgent {
  constructor() {
    super({
      name: 'scraper',
      description: 'Agent for scraping AI platforms',
      version: '1.0.0',
    });
  }
  
  async execute(input: ScraperInput): Promise<ScraperOutput> {
    const startTime = Date.now();
    
    try {
      // Dynamic import of the appropriate scraper based on platform
      const scraper = await this.getScraperForPlatform(input.platform);
      
      // Select a keyword to search
      const keyword = this.selectKeyword(input.client.keywords);
      
      logger.info(`Starting scraping for ${input.platform}`, {
        clientId: input.client.id,
        keyword,
      });
      
      // Initialize the scraper
      await scraper.initialize();
      
      // Perform the scraping
      const result = await scraper.scrapeKeyword(keyword);
      
      // Clean up
      await scraper.cleanup();
      
      const executionTime = Date.now() - startTime;
      
      return {
        platform: input.platform,
        clientId: input.client.id,
        keyword,
        response: result.response,
        mentions: result.mentions || [],
        sentiment: result.sentiment || null,
        screenshot: result.screenshot,
        executionTime,
        timestamp: new Date(),
        success: true,
      };
      
    } catch (error: any) {
      logger.error(`Scraping failed for ${input.platform}`, {
        clientId: input.client.id,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  private async getScraperForPlatform(platform: string): Promise<any> {
    // Dynamic import based on platform
    switch (platform) {
      case 'chatgpt':
        const { ChatGPTScraper } = await import('../../midscene/scrapers/chatgpt.scraper');
        return new ChatGPTScraper();
      
      case 'perplexity':
        // Placeholder for other scrapers
        const { PerplexityScraper } = await import('../../midscene/scrapers/perplexity.scraper');
        return new PerplexityScraper();
      
      case 'gemini':
        const { GeminiScraper } = await import('../../midscene/scrapers/gemini.scraper');
        return new GeminiScraper();
      
      case 'claude':
        const { ClaudeScraper } = await import('../../midscene/scrapers/claude.scraper');
        return new ClaudeScraper();
      
      case 'google-ai':
        const { GoogleAIScraper } = await import('../../midscene/scrapers/google-ai.scraper');
        return new GoogleAIScraper();
      
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
  
  private selectKeyword(keywords: string[]): string {
    // Randomly select a keyword (can be improved with more sophisticated logic)
    return keywords[Math.floor(Math.random() * keywords.length)];
  }
}

// Export as Mastra-compatible agent
export const scraperAgent = createAgent({
  name: 'scraper',
  description: 'Agent for scraping AI platforms',
  execute: async (input: ScraperInput) => {
    const agent = new ScraperAgent();
    return await agent.execute(input);
  },
});