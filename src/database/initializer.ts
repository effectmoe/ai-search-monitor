import { DatabaseConnection } from './connection';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

export class DatabaseInitializer {
  private db: DatabaseConnection;
  
  constructor() {
    this.db = DatabaseConnection.getInstance();
  }
  
  /**
   * Initialize database with schema and seed data
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Starting database initialization');
      
      // Check if database is already initialized
      if (await this.isInitialized()) {
        logger.info('Database already initialized');
        return;
      }
      
      // Run seed data
      await this.runSeedData();
      
      logger.info('Database initialization completed');
      
    } catch (error: any) {
      logger.error('Database initialization failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
  
  /**
   * Check if database is already initialized
   */
  private async isInitialized(): Promise<boolean> {
    try {
      const result = await this.db.queryOne(
        'SELECT COUNT(*) as count FROM clients'
      );
      
      return (result as any)?.count > 0;
      
    } catch (error) {
      // If table doesn't exist, database is not initialized
      return false;
    }
  }
  
  /**
   * Run seed data
   */
  private async runSeedData(): Promise<void> {
    const seedPath = path.join(__dirname, 'seed.sql');
    
    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, 'utf-8');
      
      // Split by semicolon and execute each statement
      const statements = seedSql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      for (const statement of statements) {
        try {
          await this.db.getDatabase().exec(statement);
        } catch (error: any) {
          logger.error('Failed to execute seed statement', {
            statement,
            error: error.message,
          });
          // Continue with other statements
        }
      }
      
      logger.info('Seed data executed successfully');
    } else {
      logger.warn('Seed file not found, skipping seed data');
    }
  }
  
  /**
   * Reset database (for testing)
   */
  async reset(): Promise<void> {
    logger.warn('Resetting database - all data will be lost');
    
    try {
      // Get all table names
      const tables = await this.db.query<{ name: string }>(
        `SELECT name FROM sqlite_master 
         WHERE type='table' 
         AND name NOT LIKE 'sqlite_%'`
      );
      
      // Drop all tables
      for (const table of tables) {
        await this.db.execute(`DROP TABLE IF EXISTS ${table.name}`);
      }
      
      // Recreate schema
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        await this.db.getDatabase().exec(schema);
      }
      
      // Run seed data
      await this.runSeedData();
      
      logger.info('Database reset completed');
      
    } catch (error: any) {
      logger.error('Database reset failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
  
  /**
   * Backup database
   */
  async backup(backupPath?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = backupPath || `./data/backup-${timestamp}.db`;
    
    await this.db.backup(path);
    
    logger.info('Database backup created', { path });
    
    return path;
  }
  
  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<any> {
    try {
      const stats = this.db.getStats();
      
      // Check table counts
      const tableCounts = await this.getTableCounts();
      
      // Check recent activity
      const recentSessions = await this.db.queryOne(
        `SELECT COUNT(*) as count FROM monitoring_sessions 
         WHERE started_at >= datetime('now', '-1 day')`
      );
      
      const recentResults = await this.db.queryOne(
        `SELECT COUNT(*) as count FROM scraping_results 
         WHERE scraped_at >= datetime('now', '-1 day')`
      );
      
      return {
        status: 'healthy',
        stats,
        tableCounts,
        recentActivity: {
          sessions: (recentSessions as any)?.count || 0,
          results: (recentResults as any)?.count || 0,
        },
        timestamp: new Date(),
      };
      
    } catch (error: any) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }
  
  /**
   * Get table row counts
   */
  private async getTableCounts(): Promise<Record<string, number>> {
    const tables = [
      'clients', 'monitoring_sessions', 'scraping_results',
      'brand_mentions', 'competitor_mentions', 'sentiment_analysis',
      'position_analysis', 'visibility_scores', 'recommendations',
      'daily_metrics', 'error_logs', 'platform_status'
    ];
    
    const counts: Record<string, number> = {};
    
    for (const table of tables) {
      try {
        const result = await this.db.queryOne(`SELECT COUNT(*) as count FROM ${table}`);
        counts[table] = (result as any)?.count || 0;
      } catch (error) {
        counts[table] = -1; // Table doesn't exist or error
      }
    }
    
    return counts;
  }
}

// Export singleton instance
export const dbInitializer = new DatabaseInitializer();