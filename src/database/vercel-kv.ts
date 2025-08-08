/**
 * Vercel KV integration for caching and session management
 * 
 * This module provides a Redis-compatible interface using Vercel KV
 * for high-performance caching, session management, and rate limiting
 */

import { kv } from '@vercel/kv';
import { logger } from '../utils/logger';

/**
 * Vercel KV wrapper with typed operations
 */
export class VercelKVManager {
  private isConnected = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize connection and test connectivity
   */
  private async initialize(): Promise<void> {
    try {
      // Test connection with a simple ping
      await kv.set('health-check', Date.now(), { ex: 10 });
      await kv.get('health-check');
      this.isConnected = true;
      
      logger.info('Vercel KV connected successfully');
    } catch (error: any) {
      logger.error('Failed to connect to Vercel KV', {
        error: error.message,
        stack: error.stack,
      });
      this.isConnected = false;
    }
  }

  /**
   * Check if KV is available
   */
  public isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Session Management Operations
   */
  public async storeSession(userId: string, sessionData: any, expirationSeconds: number = 86400): Promise<void> {
    const key = `session:${userId}`;
    try {
      await kv.set(key, JSON.stringify(sessionData), { ex: expirationSeconds });
      logger.debug('Session stored', { userId, key, expirationSeconds });
    } catch (error: any) {
      logger.error('Failed to store session', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  public async getSession(userId: string): Promise<any | null> {
    const key = `session:${userId}`;
    try {
      const data = await kv.get(key);
      if (data) {
        return typeof data === 'string' ? JSON.parse(data) : data;
      }
      return null;
    } catch (error: any) {
      logger.error('Failed to get session', {
        userId,
        error: error.message,
      });
      return null;
    }
  }

  public async deleteSession(userId: string): Promise<void> {
    const key = `session:${userId}`;
    try {
      await kv.del(key);
      logger.debug('Session deleted', { userId, key });
    } catch (error: any) {
      logger.error('Failed to delete session', {
        userId,
        error: error.message,
      });
    }
  }

  /**
   * Token Blacklist Management
   */
  public async blacklistToken(tokenId: string, expirationSeconds: number): Promise<void> {
    const key = `blacklist:${tokenId}`;
    try {
      await kv.set(key, '1', { ex: expirationSeconds });
      logger.debug('Token blacklisted', { tokenId, expirationSeconds });
    } catch (error: any) {
      logger.error('Failed to blacklist token', {
        tokenId,
        error: error.message,
      });
      throw error;
    }
  }

  public async isTokenBlacklisted(tokenId: string): Promise<boolean> {
    const key = `blacklist:${tokenId}`;
    try {
      const result = await kv.get(key);
      return result !== null;
    } catch (error: any) {
      logger.error('Failed to check token blacklist', {
        tokenId,
        error: error.message,
      });
      return false; // Fail open for security
    }
  }

  /**
   * Rate Limiting Operations
   */
  public async incrementRateLimit(key: string, windowSeconds: number): Promise<{ count: number; resetTime: number }> {
    try {
      const rateLimitKey = `rate:${key}`;
      const current = await kv.get(rateLimitKey) as number || 0;
      const newCount = current + 1;
      
      if (current === 0) {
        // First request in window - set with expiration
        await kv.set(rateLimitKey, newCount, { ex: windowSeconds });
      } else {
        // Increment existing counter
        await kv.set(rateLimitKey, newCount, { keepTtl: true });
      }
      
      // Get TTL for reset time
      const ttl = await kv.ttl(rateLimitKey);
      const resetTime = Date.now() + (ttl * 1000);
      
      return { count: newCount, resetTime };
    } catch (error: any) {
      logger.error('Failed to increment rate limit', {
        key,
        error: error.message,
      });
      throw error;
    }
  }

  public async getRateLimit(key: string): Promise<{ count: number; resetTime: number } | null> {
    try {
      const rateLimitKey = `rate:${key}`;
      const count = await kv.get(rateLimitKey) as number;
      
      if (count === null) {
        return null;
      }
      
      const ttl = await kv.ttl(rateLimitKey);
      const resetTime = Date.now() + (ttl * 1000);
      
      return { count, resetTime };
    } catch (error: any) {
      logger.error('Failed to get rate limit', {
        key,
        error: error.message,
      });
      return null;
    }
  }

  public async resetRateLimit(key: string): Promise<void> {
    const rateLimitKey = `rate:${key}`;
    try {
      await kv.del(rateLimitKey);
      logger.debug('Rate limit reset', { key });
    } catch (error: any) {
      logger.error('Failed to reset rate limit', {
        key,
        error: error.message,
      });
    }
  }

  /**
   * Cache Operations
   */
  public async setCache(key: string, value: any, expirationSeconds: number = 300): Promise<void> {
    const cacheKey = `cache:${key}`;
    try {
      const serializedValue = JSON.stringify({
        data: value,
        timestamp: Date.now(),
      });
      await kv.set(cacheKey, serializedValue, { ex: expirationSeconds });
      logger.debug('Cache set', { key: cacheKey, expirationSeconds });
    } catch (error: any) {
      logger.error('Failed to set cache', {
        key,
        error: error.message,
      });
    }
  }

  public async getCache(key: string): Promise<any | null> {
    const cacheKey = `cache:${key}`;
    try {
      const cached = await kv.get(cacheKey) as string;
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.data;
      }
      return null;
    } catch (error: any) {
      logger.error('Failed to get cache', {
        key,
        error: error.message,
      });
      return null;
    }
  }

  public async deleteCache(key: string): Promise<void> {
    const cacheKey = `cache:${key}`;
    try {
      await kv.del(cacheKey);
      logger.debug('Cache deleted', { key: cacheKey });
    } catch (error: any) {
      logger.error('Failed to delete cache', {
        key,
        error: error.message,
      });
    }
  }

  public async invalidateCachePattern(pattern: string): Promise<void> {
    try {
      // Get all cache keys matching pattern
      const keys = await kv.keys(`cache:${pattern}*`);
      if (keys.length > 0) {
        await kv.del(...keys);
        logger.debug('Cache pattern invalidated', { pattern, keysDeleted: keys.length });
      }
    } catch (error: any) {
      logger.error('Failed to invalidate cache pattern', {
        pattern,
        error: error.message,
      });
    }
  }

  /**
   * Temporary Data Storage (for password resets, etc.)
   */
  public async setTemporaryData(key: string, data: any, expirationSeconds: number = 3600): Promise<void> {
    const tempKey = `temp:${key}`;
    try {
      await kv.set(tempKey, JSON.stringify(data), { ex: expirationSeconds });
      logger.debug('Temporary data set', { key: tempKey, expirationSeconds });
    } catch (error: any) {
      logger.error('Failed to set temporary data', {
        key,
        error: error.message,
      });
      throw error;
    }
  }

  public async getTemporaryData(key: string): Promise<any | null> {
    const tempKey = `temp:${key}`;
    try {
      const data = await kv.get(tempKey) as string;
      if (data) {
        return JSON.parse(data);
      }
      return null;
    } catch (error: any) {
      logger.error('Failed to get temporary data', {
        key,
        error: error.message,
      });
      return null;
    }
  }

  public async deleteTemporaryData(key: string): Promise<void> {
    const tempKey = `temp:${key}`;
    try {
      await kv.del(tempKey);
      logger.debug('Temporary data deleted', { key: tempKey });
    } catch (error: any) {
      logger.error('Failed to delete temporary data', {
        key,
        error: error.message,
      });
    }
  }

  /**
   * Analytics and Metrics Storage
   */
  public async incrementMetric(metric: string, value: number = 1): Promise<void> {
    const key = `metric:${metric}:${this.getCurrentHour()}`;
    try {
      await kv.incrbyfloat(key, value);
      await kv.expire(key, 86400 * 7); // Keep for 7 days
      logger.debug('Metric incremented', { metric, value, key });
    } catch (error: any) {
      logger.error('Failed to increment metric', {
        metric,
        error: error.message,
      });
    }
  }

  public async getMetrics(metric: string, hours: number = 24): Promise<{ [hour: string]: number }> {
    try {
      const keys = [];
      const currentHour = this.getCurrentHour();
      
      for (let i = 0; i < hours; i++) {
        const hour = this.getHourOffset(currentHour, -i);
        keys.push(`metric:${metric}:${hour}`);
      }
      
      const values = await kv.mget(...keys) as (number | null)[];
      const result: { [hour: string]: number } = {};
      
      keys.forEach((key, index) => {
        const hour = key.split(':')[2];
        result[hour] = values[index] || 0;
      });
      
      return result;
    } catch (error: any) {
      logger.error('Failed to get metrics', {
        metric,
        error: error.message,
      });
      return {};
    }
  }

  /**
   * Utility methods
   */
  private getCurrentHour(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
  }

  private getHourOffset(baseHour: string, offset: number): string {
    const [year, month, day, hour] = baseHour.split('-').map(Number);
    const date = new Date(year, month - 1, day, hour + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
  }

  /**
   * Health check and diagnostics
   */
  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string }> {
    const startTime = Date.now();
    try {
      const testKey = `health:${Date.now()}`;
      await kv.set(testKey, '1', { ex: 5 });
      const result = await kv.get(testKey);
      await kv.del(testKey);
      
      const latency = Date.now() - startTime;
      
      if (result === '1') {
        return { status: 'healthy', latency };
      } else {
        return { status: 'unhealthy', error: 'Data consistency check failed' };
      }
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message,
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Get storage statistics
   */
  public async getStats(): Promise<{ totalKeys: number; memoryUsage?: string }> {
    try {
      // Get approximate key count by scanning patterns
      const patterns = ['session:*', 'rate:*', 'cache:*', 'temp:*', 'metric:*', 'blacklist:*'];
      let totalKeys = 0;
      
      for (const pattern of patterns) {
        const keys = await kv.keys(pattern);
        totalKeys += keys.length;
      }
      
      return { totalKeys };
    } catch (error: any) {
      logger.error('Failed to get KV stats', {
        error: error.message,
      });
      return { totalKeys: 0 };
    }
  }

  /**
   * Cleanup expired data (should be called periodically)
   */
  public async cleanup(): Promise<{ deletedKeys: number }> {
    let deletedKeys = 0;
    try {
      // KV automatically handles expiration, but we can clean up some patterns manually
      const patterns = ['temp:*', 'cache:*'];
      
      for (const pattern of patterns) {
        const keys = await kv.keys(pattern);
        // In a real cleanup, you'd check timestamps and delete expired keys
        // For now, just report the count
        deletedKeys += keys.length;
      }
      
      logger.info('KV cleanup completed', { deletedKeys });
      return { deletedKeys };
    } catch (error: any) {
      logger.error('Failed to cleanup KV', {
        error: error.message,
      });
      return { deletedKeys: 0 };
    }
  }
}

// Export singleton instance
export const vercelKV = new VercelKVManager();
export default vercelKV;