/**
 * Mock Database Implementation for Testing
 * This provides in-memory data storage for testing the system without database dependencies
 */

// Database interface for mock implementation
import { logger } from '../utils/logger';

export interface MockClient {
  id: number;
  name: string;
  description?: string;
  brandNames: string[];
  competitorNames: string[];
  keywords: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockMonitoringResult {
  id: number;
  clientId: number;
  platform: string;
  query: string;
  results: any;
  metadata: any;
  mentionsFound: number;
  sentimentScore?: number;
  executedAt: Date;
  completedAt: Date;
}

interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
}

class MockDatabase implements DatabaseConnection {
  private clients: Map<number, MockClient> = new Map();
  private monitoringResults: Map<number, MockMonitoringResult> = new Map();
  private clientIdCounter = 1;
  private resultIdCounter = 1;

  constructor() {
    this.initializeDefaultData();
  }

  /**
   * Initialize with some default test data
   */
  private initializeDefaultData(): void {
    // Add default test clients
    const defaultClients: Omit<MockClient, 'id'>[] = [
      {
        name: 'テスト企業A',
        description: 'テスト用の企業A',
        brandNames: ['ブランドA', 'ProductA'],
        competitorNames: ['競合B', '競合C'],
        keywords: ['AI', 'テクノロジー', '革新'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'テスト企業B',
        description: 'テスト用の企業B',
        brandNames: ['ブランドB', 'ServiceB'],
        competitorNames: ['競合A', '競合D'],
        keywords: ['データ分析', 'ビッグデータ', 'クラウド'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    defaultClients.forEach(client => {
      this.clients.set(this.clientIdCounter, {
        ...client,
        id: this.clientIdCounter,
      });
      this.clientIdCounter++;
    });

    logger.info('Mock database initialized with default data', {
      clientCount: this.clients.size,
    });
  }

  /**
   * Database connection methods
   */
  async connect(): Promise<void> {
    logger.info('Mock database connected');
  }

  async disconnect(): Promise<void> {
    logger.info('Mock database disconnected');
  }

  async ping(): Promise<boolean> {
    return true;
  }

  /**
   * Client management
   */
  async createClient(data: Omit<MockClient, 'id' | 'createdAt' | 'updatedAt'>): Promise<MockClient> {
    const client: MockClient = {
      ...data,
      id: this.clientIdCounter++,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.clients.set(client.id, client);
    logger.info('Client created in mock database', { clientId: client.id, name: client.name });
    
    return client;
  }

  async getClient(id: number): Promise<MockClient | null> {
    return this.clients.get(id) || null;
  }

  async getAllClients(activeOnly = false): Promise<MockClient[]> {
    const clients = Array.from(this.clients.values());
    return activeOnly ? clients.filter(c => c.isActive) : clients;
  }

  async updateClient(id: number, data: Partial<Omit<MockClient, 'id' | 'createdAt'>>): Promise<MockClient | null> {
    const existing = this.clients.get(id);
    if (!existing) {
      return null;
    }

    const updated: MockClient = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    this.clients.set(id, updated);
    logger.info('Client updated in mock database', { clientId: id });
    
    return updated;
  }

  async deleteClient(id: number): Promise<boolean> {
    const deleted = this.clients.delete(id);
    if (deleted) {
      logger.info('Client deleted from mock database', { clientId: id });
    }
    return deleted;
  }

  /**
   * Monitoring results
   */
  async saveMonitoringResult(data: Omit<MockMonitoringResult, 'id'>): Promise<MockMonitoringResult> {
    const result: MockMonitoringResult = {
      ...data,
      id: this.resultIdCounter++,
    };

    this.monitoringResults.set(result.id, result);
    logger.info('Monitoring result saved in mock database', { 
      resultId: result.id, 
      clientId: result.clientId,
      platform: result.platform,
    });
    
    return result;
  }

  async getMonitoringResults(
    clientId?: number,
    platform?: string,
    startDate?: Date,
    endDate?: Date,
    limit = 100
  ): Promise<MockMonitoringResult[]> {
    let results = Array.from(this.monitoringResults.values());

    if (clientId) {
      results = results.filter(r => r.clientId === clientId);
    }

    if (platform) {
      results = results.filter(r => r.platform === platform);
    }

    if (startDate) {
      results = results.filter(r => r.executedAt >= startDate);
    }

    if (endDate) {
      results = results.filter(r => r.executedAt <= endDate);
    }

    // Sort by execution date (newest first) and limit
    results.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());
    
    return results.slice(0, limit);
  }

  async getLatestMonitoringResult(clientId: number, platform: string): Promise<MockMonitoringResult | null> {
    const results = Array.from(this.monitoringResults.values())
      .filter(r => r.clientId === clientId && r.platform === platform)
      .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

    return results[0] || null;
  }

  /**
   * Statistics and analytics
   */
  async getClientStats(clientId: number): Promise<{
    totalQueries: number;
    totalMentions: number;
    averageSentiment?: number;
    platformStats: Record<string, number>;
  }> {
    const results = Array.from(this.monitoringResults.values())
      .filter(r => r.clientId === clientId);

    const platformStats: Record<string, number> = {};
    let totalMentions = 0;
    let sentimentSum = 0;
    let sentimentCount = 0;

    results.forEach(result => {
      platformStats[result.platform] = (platformStats[result.platform] || 0) + 1;
      totalMentions += result.mentionsFound || 0;
      
      if (result.sentimentScore !== undefined) {
        sentimentSum += result.sentimentScore;
        sentimentCount++;
      }
    });

    return {
      totalQueries: results.length,
      totalMentions,
      averageSentiment: sentimentCount > 0 ? sentimentSum / sentimentCount : undefined,
      platformStats,
    };
  }

  /**
   * Database maintenance
   */
  async cleanupOldResults(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const toDelete: number[] = [];
    this.monitoringResults.forEach((result, id) => {
      if (result.executedAt < cutoffDate) {
        toDelete.push(id);
      }
    });

    toDelete.forEach(id => this.monitoringResults.delete(id));

    logger.info('Cleaned up old monitoring results', { deletedCount: toDelete.length });
    return toDelete.length;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      clientCount: number;
      resultCount: number;
      responseTime: number;
    };
  }> {
    const start = Date.now();
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1));
    
    const responseTime = Date.now() - start;

    return {
      status: 'healthy',
      details: {
        clientCount: this.clients.size,
        resultCount: this.monitoringResults.size,
        responseTime,
      },
    };
  }
}

// Export singleton instance
export const mockDatabase = new MockDatabase();

// Initialize connection
mockDatabase.connect().catch(error => {
  logger.error('Failed to initialize mock database', { error: error.message });
});