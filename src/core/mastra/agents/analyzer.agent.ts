import { createAgent } from '@mastra/core';
import { BaseAgent } from './base.agent';
import { logger } from '../../../utils/logger';

export interface AnalyzerInput {
  result: any;
  client: {
    id: number;
    name: string;
    brandNames: string[];
    competitorNames?: string[];
  };
  platform: string;
}

export interface AnalyzerOutput {
  clientId: number;
  platform: string;
  analysis: {
    brandMentions: BrandMention[];
    competitorMentions: CompetitorMention[];
    sentiment: SentimentAnalysis;
    position: PositionAnalysis;
    visibility: VisibilityScore;
    recommendations: string[];
  };
  timestamp: Date;
}

interface BrandMention {
  brand: string;
  count: number;
  positions: number[];
  contexts: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  strength: number;
}

interface CompetitorMention {
  competitor: string;
  count: number;
  positions: number[];
  comparisonContext?: string;
}

interface SentimentAnalysis {
  overall: 'positive' | 'neutral' | 'negative';
  score: number;
  breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

interface PositionAnalysis {
  averagePosition: number;
  firstMentionPosition: number;
  lastMentionPosition: number;
  relativePosition: 'beginning' | 'early' | 'middle' | 'late' | 'end';
}

interface VisibilityScore {
  score: number;
  factors: {
    mentionCount: number;
    positionScore: number;
    sentimentScore: number;
    competitorComparison: number;
  };
}

export class AnalyzerAgent extends BaseAgent {
  constructor() {
    super({
      name: 'analyzer',
      description: 'Agent for analyzing scraping results',
      version: '1.0.0',
    });
  }
  
  async execute(input: AnalyzerInput): Promise<AnalyzerOutput> {
    try {
      logger.info('Starting analysis', {
        clientId: input.client.id,
        platform: input.platform,
      });
      
      // Analyze brand mentions
      const brandMentions = this.analyzeBrandMentions(
        input.result,
        input.client.brandNames
      );
      
      // Analyze competitor mentions
      const competitorMentions = this.analyzeCompetitorMentions(
        input.result,
        input.client.competitorNames || []
      );
      
      // Analyze sentiment
      const sentiment = this.analyzeSentiment(input.result, brandMentions);
      
      // Analyze position
      const position = this.analyzePosition(brandMentions);
      
      // Calculate visibility score
      const visibility = this.calculateVisibilityScore(
        brandMentions,
        competitorMentions,
        sentiment,
        position
      );
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(
        brandMentions,
        competitorMentions,
        sentiment,
        position,
        visibility
      );
      
      return {
        clientId: input.client.id,
        platform: input.platform,
        analysis: {
          brandMentions,
          competitorMentions,
          sentiment,
          position,
          visibility,
          recommendations,
        },
        timestamp: new Date(),
      };
      
    } catch (error: any) {
      logger.error('Analysis failed', {
        clientId: input.client.id,
        platform: input.platform,
        error: error.message,
      });
      
      throw error;
    }
  }
  
  private analyzeBrandMentions(result: any, brandNames: string[]): BrandMention[] {
    const mentions: BrandMention[] = [];
    const text = result.response || '';
    
    for (const brand of brandNames) {
      const regex = new RegExp(`\\b${this.escapeRegex(brand)}\\b`, 'gi');
      const matches = Array.from(text.matchAll(regex));
      
      if (matches.length > 0) {
        const positions = matches.map(match => match.index || 0);
        const contexts = matches.map(match => 
          this.extractContext(text, match.index || 0, 150)
        );
        
        mentions.push({
          brand,
          count: matches.length,
          positions,
          contexts,
          sentiment: this.analyzeMentionSentiment(contexts),
          strength: this.calculateMentionStrength(contexts, brand),
        });
      }
    }
    
    return mentions;
  }
  
  private analyzeCompetitorMentions(result: any, competitorNames: string[]): CompetitorMention[] {
    const mentions: CompetitorMention[] = [];
    const text = result.response || '';
    
    for (const competitor of competitorNames) {
      const regex = new RegExp(`\\b${this.escapeRegex(competitor)}\\b`, 'gi');
      const matches = Array.from(text.matchAll(regex));
      
      if (matches.length > 0) {
        const positions = matches.map(match => match.index || 0);
        
        mentions.push({
          competitor,
          count: matches.length,
          positions,
          comparisonContext: this.findComparisonContext(text, competitor),
        });
      }
    }
    
    return mentions;
  }
  
  private analyzeSentiment(result: any, brandMentions: BrandMention[]): SentimentAnalysis {
    let positive = 0;
    let neutral = 0;
    let negative = 0;
    
    brandMentions.forEach(mention => {
      switch (mention.sentiment) {
        case 'positive':
          positive += mention.count;
          break;
        case 'negative':
          negative += mention.count;
          break;
        default:
          neutral += mention.count;
      }
    });
    
    const total = positive + neutral + negative;
    
    if (total === 0) {
      return {
        overall: 'neutral',
        score: 0,
        breakdown: { positive: 0, neutral: 0, negative: 0 },
      };
    }
    
    const score = (positive - negative) / total;
    let overall: 'positive' | 'neutral' | 'negative' = 'neutral';
    
    if (score > 0.3) overall = 'positive';
    else if (score < -0.3) overall = 'negative';
    
    return {
      overall,
      score,
      breakdown: {
        positive: positive / total,
        neutral: neutral / total,
        negative: negative / total,
      },
    };
  }
  
  private analyzePosition(brandMentions: BrandMention[]): PositionAnalysis {
    if (brandMentions.length === 0 || brandMentions.every(m => m.positions.length === 0)) {
      return {
        averagePosition: -1,
        firstMentionPosition: -1,
        lastMentionPosition: -1,
        relativePosition: 'end',
      };
    }
    
    const allPositions = brandMentions.flatMap(m => m.positions).sort((a, b) => a - b);
    const averagePosition = allPositions.reduce((a, b) => a + b, 0) / allPositions.length;
    const firstMentionPosition = Math.min(...allPositions);
    const lastMentionPosition = Math.max(...allPositions);
    
    // Determine relative position (assuming average text length of 5000 chars)
    const relativePos = averagePosition / 5000;
    let relativePosition: 'beginning' | 'early' | 'middle' | 'late' | 'end';
    
    if (relativePos < 0.2) relativePosition = 'beginning';
    else if (relativePos < 0.4) relativePosition = 'early';
    else if (relativePos < 0.6) relativePosition = 'middle';
    else if (relativePos < 0.8) relativePosition = 'late';
    else relativePosition = 'end';
    
    return {
      averagePosition,
      firstMentionPosition,
      lastMentionPosition,
      relativePosition,
    };
  }
  
  private calculateVisibilityScore(
    brandMentions: BrandMention[],
    competitorMentions: CompetitorMention[],
    sentiment: SentimentAnalysis,
    position: PositionAnalysis
  ): VisibilityScore {
    const totalBrandMentions = brandMentions.reduce((sum, m) => sum + m.count, 0);
    const totalCompetitorMentions = competitorMentions.reduce((sum, m) => sum + m.count, 0);
    
    // Mention count factor (0-25 points)
    const mentionCount = Math.min(totalBrandMentions * 5, 25);
    
    // Position factor (0-25 points)
    let positionScore = 0;
    if (position.relativePosition === 'beginning') positionScore = 25;
    else if (position.relativePosition === 'early') positionScore = 20;
    else if (position.relativePosition === 'middle') positionScore = 15;
    else if (position.relativePosition === 'late') positionScore = 10;
    else positionScore = 5;
    
    // Sentiment factor (0-25 points)
    const sentimentScore = sentiment.overall === 'positive' ? 25 :
                          sentiment.overall === 'neutral' ? 15 : 5;
    
    // Competitor comparison (0-25 points)
    const competitorComparison = totalBrandMentions > totalCompetitorMentions ? 25 :
                                 totalBrandMentions === totalCompetitorMentions ? 15 : 5;
    
    const score = mentionCount + positionScore + sentimentScore + competitorComparison;
    
    return {
      score,
      factors: {
        mentionCount,
        positionScore,
        sentimentScore,
        competitorComparison,
      },
    };
  }
  
  private generateRecommendations(
    brandMentions: BrandMention[],
    competitorMentions: CompetitorMention[],
    sentiment: SentimentAnalysis,
    position: PositionAnalysis,
    visibility: VisibilityScore
  ): string[] {
    const recommendations: string[] = [];
    
    // Low visibility
    if (visibility.score < 30) {
      recommendations.push('Increase brand presence through more comprehensive content');
      recommendations.push('Consider creating dedicated FAQ sections about your brand');
    }
    
    // Poor positioning
    if (position.relativePosition === 'late' || position.relativePosition === 'end') {
      recommendations.push('Optimize content to appear earlier in AI responses');
      recommendations.push('Focus on primary keywords and main value propositions');
    }
    
    // Negative sentiment
    if (sentiment.overall === 'negative') {
      recommendations.push('Address negative perceptions through improved messaging');
      recommendations.push('Create positive case studies and success stories');
    }
    
    // Competitor dominance
    const totalBrandMentions = brandMentions.reduce((sum, m) => sum + m.count, 0);
    const totalCompetitorMentions = competitorMentions.reduce((sum, m) => sum + m.count, 0);
    
    if (totalCompetitorMentions > totalBrandMentions) {
      recommendations.push('Strengthen competitive positioning');
      recommendations.push('Highlight unique differentiators more prominently');
    }
    
    // No mentions
    if (brandMentions.length === 0) {
      recommendations.push('Critical: No brand mentions detected');
      recommendations.push('Urgent need for brand awareness campaign');
    }
    
    return recommendations;
  }
  
  private analyzeMentionSentiment(contexts: string[]): 'positive' | 'neutral' | 'negative' {
    let positiveCount = 0;
    let negativeCount = 0;
    
    const positiveWords = ['best', 'excellent', 'great', 'recommended', 'top', 'leading', 
                          '最高', '優れ', 'おすすめ', '人気', '信頼'];
    const negativeWords = ['poor', 'bad', 'worst', 'avoid', 'problem', 'issue',
                          '問題', '悪い', '避ける', '欠点'];
    
    contexts.forEach(context => {
      const lowerContext = context.toLowerCase();
      
      positiveWords.forEach(word => {
        if (lowerContext.includes(word)) positiveCount++;
      });
      
      negativeWords.forEach(word => {
        if (lowerContext.includes(word)) negativeCount++;
      });
    });
    
    if (positiveCount > negativeCount * 1.5) return 'positive';
    if (negativeCount > positiveCount * 1.5) return 'negative';
    return 'neutral';
  }
  
  private calculateMentionStrength(contexts: string[], brand: string): number {
    let strength = 50; // Base strength
    
    contexts.forEach(context => {
      // Check for strong endorsements
      if (context.match(/highly recommend|strongly recommend|best choice|top choice/i)) {
        strength += 10;
      }
      
      // Check for primary subject
      if (context.startsWith(brand) || context.match(new RegExp(`^${brand}\\s+(is|are)`, 'i'))) {
        strength += 5;
      }
      
      // Check for comparison wins
      if (context.match(/better than|superior to|outperforms/i)) {
        strength += 5;
      }
    });
    
    return Math.min(strength, 100);
  }
  
  private extractContext(text: string, position: number, windowSize: number): string {
    const start = Math.max(0, position - windowSize);
    const end = Math.min(text.length, position + windowSize);
    return text.substring(start, end).trim();
  }
  
  private findComparisonContext(text: string, competitor: string): string | undefined {
    const comparisonPatterns = [
      new RegExp(`compared to ${competitor}`, 'i'),
      new RegExp(`versus ${competitor}`, 'i'),
      new RegExp(`vs\\.? ${competitor}`, 'i'),
      new RegExp(`${competitor} vs\\.?`, 'i'),
    ];
    
    for (const pattern of comparisonPatterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        return this.extractContext(text, match.index, 200);
      }
    }
    
    return undefined;
  }
  
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export as Mastra-compatible agent
export const analyzerAgent = createAgent({
  name: 'analyzer',
  description: 'Agent for analyzing scraping results',
  execute: async (input: AnalyzerInput) => {
    const agent = new AnalyzerAgent();
    return await agent.execute(input);
  },
});