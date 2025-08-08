import { DatabaseConnection } from '../connection';
import { logger } from '../../utils/logger';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}

export abstract class BaseRepository<T> {
  protected db: DatabaseConnection;
  protected tableName: string;
  
  constructor(tableName: string) {
    this.db = DatabaseConnection.getInstance();
    this.tableName = tableName;
  }
  
  /**
   * Find all records
   */
  async findAll(options?: QueryOptions): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    
    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy} ${options.order || 'ASC'}`;
    }
    
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }
    
    return this.db.query<T>(sql);
  }
  
  /**
   * Find by ID
   */
  async findById(id: number): Promise<T | undefined> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    return this.db.queryOne<T>(sql, [id]);
  }
  
  /**
   * Find with conditions
   */
  async findWhere(conditions: Record<string, any>, options?: QueryOptions): Promise<T[]> {
    const whereClause = Object.keys(conditions)
      .map(key => `${key} = ?`)
      .join(' AND ');
    
    let sql = `SELECT * FROM ${this.tableName} WHERE ${whereClause}`;
    
    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy} ${options.order || 'ASC'}`;
    }
    
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }
    
    return this.db.query<T>(sql, Object.values(conditions));
  }
  
  /**
   * Find one with conditions
   */
  async findOneWhere(conditions: Record<string, any>): Promise<T | undefined> {
    const whereClause = Object.keys(conditions)
      .map(key => `${key} = ?`)
      .join(' AND ');
    
    const sql = `SELECT * FROM ${this.tableName} WHERE ${whereClause} LIMIT 1`;
    return this.db.queryOne<T>(sql, Object.values(conditions));
  }
  
  /**
   * Insert a new record
   */
  async insert(data: Partial<T>): Promise<number> {
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    const result = this.db.execute(sql, Object.values(data));
    
    return result.lastInsertRowid as number;
  }
  
  /**
   * Insert multiple records
   */
  async insertMany(records: Partial<T>[]): Promise<number[]> {
    if (records.length === 0) return [];
    
    const fields = Object.keys(records[0]);
    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    
    const insertedIds: number[] = [];
    
    this.db.transaction(() => {
      for (const record of records) {
        const result = this.db.execute(sql, Object.values(record));
        insertedIds.push(result.lastInsertRowid as number);
      }
    })();
    
    return insertedIds;
  }
  
  /**
   * Update a record
   */
  async update(id: number, data: Partial<T>): Promise<boolean> {
    const fields = Object.keys(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    const values = [...Object.values(data), id];
    
    const result = this.db.execute(sql, values);
    return result.changes > 0;
  }
  
  /**
   * Update with conditions
   */
  async updateWhere(conditions: Record<string, any>, data: Partial<T>): Promise<number> {
    const setFields = Object.keys(data);
    const setClause = setFields.map(field => `${field} = ?`).join(', ');
    
    const whereFields = Object.keys(conditions);
    const whereClause = whereFields.map(field => `${field} = ?`).join(' AND ');
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${whereClause}`;
    const values = [...Object.values(data), ...Object.values(conditions)];
    
    const result = this.db.execute(sql, values);
    return result.changes;
  }
  
  /**
   * Delete a record
   */
  async delete(id: number): Promise<boolean> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = this.db.execute(sql, [id]);
    return result.changes > 0;
  }
  
  /**
   * Delete with conditions
   */
  async deleteWhere(conditions: Record<string, any>): Promise<number> {
    const whereClause = Object.keys(conditions)
      .map(key => `${key} = ?`)
      .join(' AND ');
    
    const sql = `DELETE FROM ${this.tableName} WHERE ${whereClause}`;
    const result = this.db.execute(sql, Object.values(conditions));
    return result.changes;
  }
  
  /**
   * Count records
   */
  async count(conditions?: Record<string, any>): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    
    if (conditions && Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions)
        .map(key => `${key} = ?`)
        .join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }
    
    const result = this.db.queryOne<{ count: number }>(
      sql,
      conditions ? Object.values(conditions) : []
    );
    
    return result?.count || 0;
  }
  
  /**
   * Check if record exists
   */
  async exists(conditions: Record<string, any>): Promise<boolean> {
    const count = await this.count(conditions);
    return count > 0;
  }
  
  /**
   * Execute raw SQL
   */
  protected async raw<R = any>(sql: string, params?: any[]): Promise<R[]> {
    return this.db.query<R>(sql, params);
  }
  
  /**
   * Execute raw SQL for single result
   */
  protected async rawOne<R = any>(sql: string, params?: any[]): Promise<R | undefined> {
    return this.db.queryOne<R>(sql, params);
  }
  
  /**
   * Execute raw SQL statement
   */
  protected async execute(sql: string, params?: any[]): Promise<any> {
    return this.db.execute(sql, params);
  }
  
  /**
   * Run in transaction
   */
  protected transaction<R>(callback: () => R): R {
    return this.db.transaction(callback);
  }
}