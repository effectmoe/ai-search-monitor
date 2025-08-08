import { BaseRepository } from './base.repository';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface MonitoringSession {
  id?: number;
  session_id: string;
  started_at?: Date;
  completed_at?: Date;
  status: 'running' | 'completed' | 'failed' | 'partial';
  total_clients?: number;
  total_platforms?: number;
  successful_scrapes?: number;
  failed_scrapes?: number;
  metadata?: string | any;
}

export class MonitoringSessionRepository extends BaseRepository<MonitoringSession> {
  constructor() {
    super('monitoring_sessions');
  }
  
  /**
   * Start a new monitoring session
   */
  async startSession(
    totalClients: number,
    totalPlatforms: number,
    metadata?: any
  ): Promise<string> {
    const sessionId = uuidv4();
    
    await this.insert({
      session_id: sessionId,
      status: 'running',
      total_clients: totalClients,
      total_platforms: totalPlatforms,
      successful_scrapes: 0,
      failed_scrapes: 0,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
    
    logger.info('Monitoring session started', {
      sessionId,
      totalClients,
      totalPlatforms,
    });
    
    return sessionId;
  }
  
  /**
   * Update session progress
   */
  async updateProgress(
    sessionId: string,
    successful: number,
    failed: number
  ): Promise<void> {
    const sql = `
      UPDATE monitoring_sessions 
      SET successful_scrapes = successful_scrapes + ?,
          failed_scrapes = failed_scrapes + ?
      WHERE session_id = ?
    `;
    
    await this.execute(sql, [successful, failed]);
  }
  
  /**
   * Complete a session
   */
  async completeSession(
    sessionId: string,
    status: 'completed' | 'failed' | 'partial'
  ): Promise<void> {
    const sql = `
      UPDATE monitoring_sessions 
      SET status = ?,
          completed_at = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `;
    
    await this.execute(sql, [status, sessionId]);
    
    logger.info('Monitoring session completed', { sessionId, status });
  }
  
  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<MonitoringSession | undefined> {
    const session = await this.findOneWhere({ session_id: sessionId });
    
    if (session && typeof session.metadata === 'string') {
      try {
        session.metadata = JSON.parse(session.metadata);
      } catch (error) {
        logger.error('Failed to parse session metadata', { error });
      }
    }
    
    return session;
  }
  
  /**
   * Get recent sessions
   */
  async getRecentSessions(limit: number = 10): Promise<MonitoringSession[]> {
    const sessions = await this.findAll({
      orderBy: 'started_at',
      order: 'DESC',
      limit,
    });
    
    return sessions.map(session => {
      if (typeof session.metadata === 'string') {
        try {
          session.metadata = JSON.parse(session.metadata);
        } catch (error) {
          logger.error('Failed to parse session metadata', { error });
        }
      }
      return session;
    });
  }
  
  /**
   * Get running sessions
   */
  async getRunningSessions(): Promise<MonitoringSession[]> {
    return this.findWhere({ status: 'running' });
  }
  
  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<any> {
    const sql = `
      SELECT 
        ms.*,
        COUNT(DISTINCT sr.client_id) as unique_clients,
        COUNT(DISTINCT sr.platform) as unique_platforms,
        AVG(sr.execution_time_ms) as avg_execution_time,
        MIN(sr.scraped_at) as first_scrape,
        MAX(sr.scraped_at) as last_scrape
      FROM monitoring_sessions ms
      LEFT JOIN scraping_results sr ON ms.session_id = sr.session_id
      WHERE ms.session_id = ?
      GROUP BY ms.id
    `;
    
    return this.rawOne(sql, [sessionId]);
  }
  
  /**
   * Clean up old sessions
   */
  async cleanupOldSessions(days: number = 30): Promise<number> {
    const sql = `
      DELETE FROM monitoring_sessions
      WHERE completed_at < datetime('now', '-' || ? || ' days')
      AND status != 'running'
    `;
    
    const result = await this.execute(sql, [days]);
    
    logger.info(`Cleaned up ${result.changes} old sessions`);
    
    return result.changes;
  }
}