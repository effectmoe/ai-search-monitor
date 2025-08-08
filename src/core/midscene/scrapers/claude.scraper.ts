import { BaseScraper, ScrapeResult } from './base.scraper';
import { logger } from '../../../utils/logger';

export class ClaudeScraper extends BaseScraper {
  private readonly CLAUDE_URL = 'https://claude.ai';
  
  constructor(config?: any) {
    super('Claude', config);
  }
  
  protected async navigateToPlatform(): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    
    logger.info('Navigating to Claude');
    await this.page.goto(this.CLAUDE_URL, {
      waitUntil: 'networkidle',
      timeout: this.config.timeout,
    });
    
    await this.page.waitForLoadState('domcontentloaded');
  }
  
  protected async handleAuthentication(): Promise<void> {
    // Check if login is required
    const isLoggedIn = await this.aiExists('New conversation button or chat interface');
    
    if (!isLoggedIn) {
      logger.warn('Claude requires authentication - assuming saved session');
      // In production, would handle Anthropic account authentication
    }
  }
  
  protected async performSearch(keyword: string): Promise<void> {
    logger.info(`Performing Claude search for: ${keyword}`);
    
    try {
      // Start new conversation if needed
      const hasNewConversationButton = await this.aiExists('New conversation or New chat button');
      if (hasNewConversationButton) {
        await this.aiInteract('Click New conversation or New chat button');
        await this.page!.waitForTimeout(1000);
      }
      
      // Type in the message field
      await this.aiInteract(`Type "${keyword}" in the message or prompt input field`);
      
      // Submit the message
      await this.aiInteract('Click send button or press Enter to submit the message');
      
      logger.info('Search query submitted to Claude');
      
    } catch (error: any) {
      logger.error('Failed to perform Claude search', {
        keyword,
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async waitForResults(): Promise<void> {
    logger.info('Waiting for Claude response');
    
    try {
      // Wait for response to complete
      await this.waitFor(
        async () => {
          // Check if Claude is still typing
          const isTyping = await this.aiExists('Claude is typing indicator or streaming text');
          const hasResponse = await this.aiExists('Claude response message or answer');
          return hasResponse && !isTyping;
        },
        { timeout: 60000, interval: 2000 }
      );
      
      // Wait for any final formatting
      await this.page!.waitForTimeout(2000);
      
      logger.info('Claude response received');
      
    } catch (error: any) {
      logger.error('Timeout waiting for Claude response', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async extractContent(): Promise<any> {
    logger.info('Extracting content from Claude');
    
    try {
      // Extract the main response
      const response = await this.aiExtract(
        'Extract the complete Claude response including all text, code blocks, lists, and formatted content'
      );
      
      // Extract any artifacts (code, documents, etc.)
      const artifacts = await this.aiExtract(
        'Extract any artifacts, code windows, or document previews if shown separately'
      );
      
      // Extract conversation context
      const context = await this.aiExtract(
        'Extract any visible conversation context or previous messages if shown'
      );
      
      return {
        response,
        artifacts: artifacts || [],
        context: context || null,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error: any) {
      logger.error('Failed to extract Claude content', {
        error: error.message,
      });
      throw error;
    }
  }
  
  protected async parseResult(content: any, keyword: string): Promise<ScrapeResult> {
    logger.info('Parsing Claude result');
    
    try {
      const response = content.response || '';
      
      // Extract structured information
      const mentions = this.extractStructuredMentions(response);
      
      // Analyze reasoning and sentiment
      const sentiment = this.analyzeClaudeReasoning(response);
      
      // Process artifacts if any
      const artifactAnalysis = content.artifacts?.length > 0
        ? this.analyzeArtifacts(content.artifacts)
        : null;
      
      return {
        response,
        mentions,
        sentiment,
        metadata: {
          platform: 'Claude',
          keyword,
          extractedAt: content.timestamp,
          responseLength: response.length,
          hasArtifacts: content.artifacts?.length > 0,
          artifactCount: content.artifacts?.length || 0,
          artifactAnalysis,
          conversationContext: content.context ? 'available' : 'none',
        },
      };
      
    } catch (error: any) {
      logger.error('Failed to parse Claude result', {
        error: error.message,
      });
      throw error;
    }
  }
  
  private extractStructuredMentions(text: string): any[] {
    const mentions = [];
    
    // Claude often structures responses with clear sections
    const sectionPatterns = [
      /(?:^|\n)(?:##?\s+)?([A-Z][^:\n]+):/gm,
      /(?:^|\n)(?:\d+\.\s+)?([A-Z][^:\n]+):/gm,
      /(?:^|\n)•\s+([A-Z][^:\n]+):/gm,
    ];
    
    // Extract section headers and their content
    sectionPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const sectionName = match[1].trim();
        const sectionStart = match.index + match[0].length;
        
        // Find the end of this section (next section or end of text)
        let sectionEnd = text.length;
        for (const nextPattern of sectionPatterns) {
          const nextMatch = nextPattern.exec(text.substring(sectionStart));
          if (nextMatch && nextMatch.index < sectionEnd) {
            sectionEnd = sectionStart + nextMatch.index;
          }
        }
        
        const sectionContent = text.substring(sectionStart, sectionEnd).trim();
        
        mentions.push({
          type: 'section',
          title: sectionName,
          content: sectionContent,
          position: match.index,
        });
      }
    });
    
    // Extract entities mentioned
    const entityPatterns = {
      tools: /(?:tool|library|framework|platform):\s*([^\n,]+)/gi,
      companies: /(?:company|organization|vendor):\s*([^\n,]+)/gi,
      products: /(?:product|service|solution):\s*([^\n,]+)/gi,
      recommendations: /(?:recommend|suggest|advise):\s*([^\n,]+)/gi,
    };
    
    for (const [type, pattern] of Object.entries(entityPatterns)) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        mentions.push({
          type,
          text: match[1].trim(),
          position: match.index,
          context: text.substring(
            Math.max(0, match.index - 100),
            Math.min(text.length, match.index + match[0].length + 100)
          ),
        });
      }
    }
    
    // Extract comparison mentions
    const comparisonPattern = /(?:compared to|versus|vs\.?|in comparison to)\s+([^,.]+)/gi;
    let match;
    while ((match = comparisonPattern.exec(text)) !== null) {
      mentions.push({
        type: 'comparison',
        text: match[1].trim(),
        position: match.index,
        context: text.substring(
          Math.max(0, match.index - 100),
          Math.min(text.length, match.index + match[0].length + 100)
        ),
      });
    }
    
    return mentions;
  }
  
  private analyzeClaudeReasoning(text: string): any {
    // Claude often provides balanced, reasoned responses
    const reasoningIndicators = {
      analytical: [
        /let me analyze/gi,
        /let me break down/gi,
        /considering/gi,
        /it depends/gi,
        /分析すると/g,
        /検討すると/g,
      ],
      balanced: [
        /on one hand/gi,
        /on the other hand/gi,
        /however/gi,
        /although/gi,
        /一方で/g,
        /しかし/g,
        /ただし/g,
      ],
      conclusive: [
        /in conclusion/gi,
        /overall/gi,
        /in summary/gi,
        /therefore/gi,
        /結論として/g,
        /全体的に/g,
        /まとめると/g,
      ],
      cautious: [
        /it\'s important to note/gi,
        /keep in mind/gi,
        /be aware that/gi,
        /注意すべき/g,
        /留意点/g,
      ],
    };
    
    const reasoningScores: Record<string, number> = {};
    
    for (const [aspect, patterns] of Object.entries(reasoningIndicators)) {
      reasoningScores[aspect] = 0;
      patterns.forEach(pattern => {
        const matches = text.match(pattern);
        reasoningScores[aspect] += matches ? matches.length : 0;
      });
    }
    
    // Analyze pros and cons
    const prosPattern = /(?:pros?|advantages?|benefits?|strengths?|良い点|利点|メリット)/gi;
    const consPattern = /(?:cons?|disadvantages?|drawbacks?|weaknesses?|悪い点|欠点|デメリット)/gi;
    
    const prosCount = (text.match(prosPattern) || []).length;
    const consCount = (text.match(consPattern) || []).length;
    
    // Calculate sentiment based on Claude's typical balanced approach
    const positiveIndicators = text.match(/excellent|outstanding|superior|highly recommend|最高|優秀|強く推奨/gi);
    const negativeIndicators = text.match(/poor|inferior|not recommended|avoid|劣る|推奨しない|避ける/gi);
    const neutralIndicators = text.match(/depends|varies|mixed|case by case|場合による|ケースバイケース/gi);
    
    const positiveCount = positiveIndicators ? positiveIndicators.length : 0;
    const negativeCount = negativeIndicators ? negativeIndicators.length : 0;
    const neutralCount = neutralIndicators ? neutralIndicators.length : 0;
    
    const total = positiveCount + negativeCount + neutralCount;
    const sentimentScore = total > 0 
      ? (positiveCount - negativeCount) / total 
      : 0;
    
    return {
      score: sentimentScore,
      positive: positiveCount,
      negative: negativeCount,
      neutral: neutralCount,
      label: sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral',
      reasoning: reasoningScores,
      dominantReasoning: Object.entries(reasoningScores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'straightforward',
      prosConsBalance: {
        pros: prosCount,
        cons: consCount,
        balanced: Math.abs(prosCount - consCount) <= 2,
      },
    };
  }
  
  private analyzeArtifacts(artifacts: any[]): any {
    if (!artifacts || artifacts.length === 0) {
      return null;
    }
    
    const artifactTypes = {
      code: 0,
      document: 0,
      diagram: 0,
      table: 0,
      other: 0,
    };
    
    artifacts.forEach(artifact => {
      const artifactText = typeof artifact === 'string' ? artifact : JSON.stringify(artifact);
      
      if (artifactText.includes('```') || artifactText.includes('function') || artifactText.includes('class')) {
        artifactTypes.code++;
      } else if (artifactText.includes('##') || artifactText.includes('###')) {
        artifactTypes.document++;
      } else if (artifactText.includes('graph') || artifactText.includes('chart')) {
        artifactTypes.diagram++;
      } else if (artifactText.includes('|') && artifactText.includes('---')) {
        artifactTypes.table++;
      } else {
        artifactTypes.other++;
      }
    });
    
    return {
      count: artifacts.length,
      types: artifactTypes,
      primaryType: Object.entries(artifactTypes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other',
    };
  }
}