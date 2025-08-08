import { Page, Browser } from '@midscene/web';
import { ai } from '@midscene/web';
import { logger } from '../../../utils/logger';
import { ScraperConfig, defaultScraperConfig } from '../config/scraper.config';

export interface ScrapeResult {
  response: string;
  mentions?: any[];
  sentiment?: any;
  screenshot?: string;
  metadata?: Record<string, any>;
}

export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected config: ScraperConfig;
  protected platform: string;
  
  constructor(platform: string, config?: Partial<ScraperConfig>) {
    this.platform = platform;
    this.config = { ...defaultScraperConfig, ...config };
  }
  
  /**
   * Initialize the browser and page
   */
  async initialize(): Promise<void> {
    try {
      logger.info(`Initializing ${this.platform} scraper`, {
        headless: this.config.headless,
        locale: this.config.locale,
      });
      
      // Initialize Midscene browser
      this.browser = await ai.launch({
        headless: this.config.headless,
        viewport: this.config.viewport,
        locale: this.config.locale,
        timezoneId: this.config.timezoneId,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      });
      
      // Create new page
      this.page = await this.browser.newPage();
      
      // Set user agent
      await this.page.setUserAgent(this.config.userAgent);
      
      // Set extra headers
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      });
      
      // Navigate to platform
      await this.navigateToPlatform();
      
      // Handle platform-specific authentication if needed
      await this.handleAuthentication();
      
      logger.info(`${this.platform} scraper initialized successfully`);
      
    } catch (error: any) {
      logger.error(`Failed to initialize ${this.platform} scraper`, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
  
  /**
   * Navigate to the platform URL
   */
  protected abstract navigateToPlatform(): Promise<void>;
  
  /**
   * Handle platform-specific authentication
   */
  protected async handleAuthentication(): Promise<void> {
    // Override in child classes if authentication is needed
  }
  
  /**
   * Scrape results for a specific keyword
   */
  async scrapeKeyword(keyword: string): Promise<ScrapeResult> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }
    
    try {
      logger.info(`Scraping ${this.platform} for keyword: ${keyword}`);
      
      // Perform search
      await this.performSearch(keyword);
      
      // Wait for results to load
      await this.waitForResults();
      
      // Extract content
      const content = await this.extractContent();
      
      // Take screenshot if enabled
      let screenshot: string | undefined;
      if (this.config.screenshotQuality > 0) {
        screenshot = await this.takeScreenshot();
      }
      
      // Parse and structure the result
      const result = await this.parseResult(content, keyword);
      
      return {
        ...result,
        screenshot,
      };
      
    } catch (error: any) {
      logger.error(`Failed to scrape ${this.platform} for keyword: ${keyword}`, {
        error: error.message,
        stack: error.stack,
      });
      
      // Take error screenshot for debugging
      try {
        const errorScreenshot = await this.takeScreenshot('error');
        logger.error('Error screenshot captured', { path: errorScreenshot });
      } catch (screenshotError) {
        logger.error('Failed to capture error screenshot', { 
          error: screenshotError 
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Perform search on the platform
   */
  protected abstract performSearch(keyword: string): Promise<void>;
  
  /**
   * Wait for search results to load
   */
  protected abstract waitForResults(): Promise<void>;
  
  /**
   * Extract content from the page
   */
  protected abstract extractContent(): Promise<any>;
  
  /**
   * Parse the extracted content
   */
  protected abstract parseResult(content: any, keyword: string): Promise<ScrapeResult>;
  
  /**
   * Take a screenshot of the current page
   */
  protected async takeScreenshot(type: 'result' | 'error' = 'result'): Promise<string> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${this.platform}_${type}_${timestamp}.png`;
    const path = `./screenshots/${filename}`;
    
    await this.page.screenshot({
      path,
      fullPage: type === 'result',
      quality: this.config.screenshotQuality,
    });
    
    return path;
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      logger.info(`${this.platform} scraper cleaned up`);
      
    } catch (error: any) {
      logger.error(`Failed to cleanup ${this.platform} scraper`, {
        error: error.message,
      });
    }
  }
  
  /**
   * Helper method to wait with timeout
   */
  protected async waitFor(
    condition: () => Promise<boolean>,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const { timeout = this.config.timeout, interval = 1000 } = options;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }
  
  /**
   * Use Midscene AI to interact with elements
   */
  protected async aiInteract(instruction: string): Promise<any> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    return await ai.act(this.page, instruction);
  }
  
  /**
   * Use Midscene AI to extract information
   */
  protected async aiExtract(instruction: string): Promise<any> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    return await ai.extract(this.page, instruction);
  }
  
  /**
   * Use Midscene AI to check element existence
   */
  protected async aiExists(instruction: string): Promise<boolean> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    return await ai.exists(this.page, instruction);
  }
}