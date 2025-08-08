import { BaseRepository } from './base.repository';
import { logger } from '../../utils/logger';

export interface Client {
  id?: number;
  name: string;
  description?: string;
  brand_names: string | string[];
  competitor_names?: string | string[];
  keywords: string | string[];
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class ClientRepository extends BaseRepository<Client> {
  constructor() {
    super('clients');
  }
  
  /**
   * Create a new client
   */
  async create(client: Omit<Client, 'id'>): Promise<Client> {
    // Convert arrays to JSON strings
    const data = {
      ...client,
      brand_names: Array.isArray(client.brand_names) 
        ? JSON.stringify(client.brand_names) 
        : client.brand_names,
      competitor_names: Array.isArray(client.competitor_names) 
        ? JSON.stringify(client.competitor_names) 
        : client.competitor_names,
      keywords: Array.isArray(client.keywords) 
        ? JSON.stringify(client.keywords) 
        : client.keywords,
      is_active: client.is_active !== undefined ? client.is_active : 1,
    };
    
    const id = await this.insert(data);
    const created = await this.findById(id);
    
    if (!created) {
      throw new Error('Failed to create client');
    }
    
    return this.deserializeClient(created);
  }
  
  /**
   * Get all active clients
   */
  async findActive(): Promise<Client[]> {
    const clients = await this.findWhere({ is_active: 1 });
    return clients.map(this.deserializeClient);
  }
  
  /**
   * Get client by name
   */
  async findByName(name: string): Promise<Client | undefined> {
    const client = await this.findOneWhere({ name });
    return client ? this.deserializeClient(client) : undefined;
  }
  
  /**
   * Update client
   */
  async updateClient(id: number, updates: Partial<Client>): Promise<boolean> {
    const data = { ...updates };
    
    if (Array.isArray(updates.brand_names)) {
      data.brand_names = JSON.stringify(updates.brand_names);
    }
    
    if (Array.isArray(updates.competitor_names)) {
      data.competitor_names = JSON.stringify(updates.competitor_names);
    }
    
    if (Array.isArray(updates.keywords)) {
      data.keywords = JSON.stringify(updates.keywords);
    }
    
    return this.update(id, data);
  }
  
  /**
   * Deactivate client
   */
  async deactivate(id: number): Promise<boolean> {
    return this.update(id, { is_active: 0 });
  }
  
  /**
   * Activate client
   */
  async activate(id: number): Promise<boolean> {
    return this.update(id, { is_active: 1 });
  }
  
  /**
   * Get client statistics
   */
  async getClientStats(clientId: number): Promise<any> {
    const stats = await this.rawOne(`
      SELECT 
        c.id,
        c.name,
        COUNT(DISTINCT sr.id) as total_scrapes,
        COUNT(DISTINCT CASE WHEN sr.success = 1 THEN sr.id END) as successful_scrapes,
        COUNT(DISTINCT bm.id) as total_brand_mentions,
        COUNT(DISTINCT cm.id) as total_competitor_mentions,
        AVG(vs.total_score) as avg_visibility_score
      FROM clients c
      LEFT JOIN scraping_results sr ON c.id = sr.client_id
      LEFT JOIN brand_mentions bm ON c.id = bm.client_id
      LEFT JOIN competitor_mentions cm ON c.id = cm.client_id
      LEFT JOIN visibility_scores vs ON c.id = vs.client_id
      WHERE c.id = ?
      GROUP BY c.id
    `, [clientId]);
    
    return stats;
  }
  
  /**
   * Find clients with keywords
   */
  async findByKeyword(keyword: string): Promise<Client[]> {
    const clients = await this.raw<Client>(`
      SELECT * FROM clients 
      WHERE is_active = 1 
      AND keywords LIKE ?
    `, [`%"${keyword}"%`]);
    
    return clients.map(this.deserializeClient);
  }
  
  /**
   * Get clients for monitoring
   */
  async getClientsForMonitoring(clientIds?: number[]): Promise<Client[]> {
    let sql = `SELECT * FROM clients WHERE is_active = 1`;
    let params: any[] = [];
    
    if (clientIds && clientIds.length > 0) {
      const placeholders = clientIds.map(() => '?').join(',');
      sql += ` AND id IN (${placeholders})`;
      params = clientIds;
    }
    
    const clients = await this.raw<Client>(sql, params);
    return clients.map(this.deserializeClient);
  }
  
  /**
   * Deserialize client data
   */
  private deserializeClient(client: Client): Client {
    return {
      ...client,
      brand_names: typeof client.brand_names === 'string' 
        ? JSON.parse(client.brand_names) 
        : client.brand_names,
      competitor_names: typeof client.competitor_names === 'string' 
        ? JSON.parse(client.competitor_names || '[]') 
        : client.competitor_names,
      keywords: typeof client.keywords === 'string' 
        ? JSON.parse(client.keywords) 
        : client.keywords,
    };
  }
}

// Export singleton instance
export const clientRepository = new ClientRepository();