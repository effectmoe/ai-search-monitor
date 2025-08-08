import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: Database.Database;
  private readonly dbPath: string;
  
  private constructor() {
    // Ensure database directory exists
    const dbDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Set database path
    this.dbPath = process.env.DATABASE_PATH || path.join(dbDir, 'ai-monitor.db');
    
    // Initialize database connection
    this.db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? logger.debug : undefined,
    });
    
    // Configure database
    this.configure();
    
    // Initialize schema
    this.initializeSchema();
    
    logger.info('Database connection established', { path: this.dbPath });
  }
  
  private configure(): void {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Set journal mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    // Set synchronous mode for better performance
    this.db.pragma('synchronous = NORMAL');
    
    // Set cache size (negative value = KB)
    this.db.pragma('cache_size = -64000'); // 64MB cache
    
    // Set busy timeout to avoid lock errors
    this.db.pragma('busy_timeout = 5000'); // 5 seconds
  }
  
  private initializeSchema(): void {
    try {
      // Read and execute schema
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);
        logger.info('Database schema initialized');
      } else {
        logger.warn('Schema file not found, skipping initialization');
      }
    } catch (error: any) {
      logger.error('Failed to initialize database schema', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
  
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }
  
  public getDatabase(): Database.Database {
    return this.db;
  }
  
  /**
   * Execute a query with parameters
   */
  public query<T = any>(sql: string, params?: any[]): T[] {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...(params || [])) as T[];
    } catch (error: any) {
      logger.error('Database query failed', {
        sql,
        params,
        error: error.message,
      });
      throw error;
    }
  }
  
  /**
   * Execute a query and return single result
   */
  public queryOne<T = any>(sql: string, params?: any[]): T | undefined {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...(params || [])) as T | undefined;
    } catch (error: any) {
      logger.error('Database query failed', {
        sql,
        params,
        error: error.message,
      });
      throw error;
    }
  }
  
  /**
   * Execute an insert/update/delete statement
   */
  public execute(sql: string, params?: any[]): Database.RunResult {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.run(...(params || []));
    } catch (error: any) {
      logger.error('Database execute failed', {
        sql,
        params,
        error: error.message,
      });
      throw error;
    }
  }
  
  /**
   * Run multiple statements in a transaction
   */
  public transaction<T>(callback: () => T): T {
    const transaction = this.db.transaction(callback);
    return transaction();
  }
  
  /**
   * Backup the database
   */
  public async backup(backupPath?: string): Promise<void> {
    const backup = backupPath || `${this.dbPath}.backup.${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      this.db.backup(backup)
        .then(() => {
          logger.info('Database backup completed', { backup });
          resolve();
        })
        .catch((error) => {
          logger.error('Database backup failed', { error });
          reject(error);
        });
    });
  }
  
  /**
   * Close the database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      logger.info('Database connection closed');
    }
  }
  
  /**
   * Get database statistics
   */
  public getStats(): any {
    return {
      memory: this.db.pragma('cache_size'),
      pageCount: this.db.pragma('page_count'),
      pageSize: this.db.pragma('page_size'),
      journalMode: this.db.pragma('journal_mode'),
      walCheckpoint: this.db.pragma('wal_checkpoint(TRUNCATE)'),
    };
  }
}

// Export singleton instance
export const db = DatabaseConnection.getInstance();