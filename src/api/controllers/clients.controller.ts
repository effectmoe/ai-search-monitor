import { Response, NextFunction } from 'express';
import { 
  AuthenticatedRequest, 
  CreateClientSchema,
  UpdateClientSchema,
  ErrorCodes,
} from '../types/api.types';
import { errorMiddleware } from '../middleware/error.middleware';
import { clientRepository } from '../../database';
import { logger } from '../../utils/logger';

export class ClientsController {
  /**
   * Get all clients (with pagination and filtering)
   * GET /api/v1/clients
   */
  getClients = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { 
        page = 1, 
        limit = 50, 
        search, 
        isActive,
        sort = 'name',
        order = 'asc' 
      } = req.query as any;
      
      // Build filters
      const filters: any = {};
      if (search) {
        filters.search = search;
      }
      if (isActive !== undefined) {
        filters.is_active = isActive === 'true';
      }
      
      // Filter by user permissions (non-admin users can only see their clients)
      if (req.user?.role !== 'admin' && req.user?.clientIds) {
        filters.client_ids = req.user.clientIds;
      }
      
      const { results: clients, total } = await clientRepository.findPaginated({
        filters,
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy: sort,
        sortOrder: order as 'asc' | 'desc',
      });
      
      // Format response
      const formattedClients = clients.map(client => ({
        id: client.id,
        name: client.name,
        description: client.description,
        brandNames: client.brand_names,
        competitorNames: client.competitor_names,
        keywords: client.keywords,
        isActive: client.is_active,
        createdAt: client.created_at,
        updatedAt: client.updated_at,
        stats: {
          totalQueries: 0, // TODO: Get from scraping results
          successRate: 0,  // TODO: Calculate from results
          lastMonitored: null, // TODO: Get latest monitoring session
        },
      }));
      
      return res.paginated(
        formattedClients,
        parseInt(page),
        total,
        parseInt(limit),
        {
          filters,
          sorting: { field: sort, order },
        }
      );
    }
  );
  
  /**
   * Get specific client by ID
   * GET /api/v1/clients/:id
   */
  getClientById = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientId = parseInt(req.params.id);
      
      const client = await clientRepository.findById(clientId);
      if (!client) {
        throw errorMiddleware.createNotFoundError('Client', clientId);
      }
      
      // Check access permissions
      if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(clientId)) {
        throw errorMiddleware.createForbiddenError('Access denied to this client');
      }
      
      // Get client statistics
      const stats = await clientRepository.getClientStats(clientId);
      
      const formattedClient = {
        id: client.id,
        name: client.name,
        description: client.description,
        brandNames: client.brand_names,
        competitorNames: client.competitor_names,
        keywords: client.keywords,
        isActive: client.is_active,
        createdAt: client.created_at,
        updatedAt: client.updated_at,
        stats: {
          totalQueries: stats?.total_queries || 0,
          successfulQueries: stats?.successful_queries || 0,
          failedQueries: stats?.failed_queries || 0,
          successRate: stats ? (stats.successful_queries / (stats.total_queries || 1)) * 100 : 0,
          averageVisibilityScore: stats?.avg_visibility_score || 0,
          lastMonitored: stats?.last_monitored,
          platformStats: stats?.platform_stats || {},
        },
      };
      
      return res.success(formattedClient);
    }
  );
  
  /**
   * Create new client
   * POST /api/v1/clients
   */
  createClient = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      // Only admin users can create clients
      if (req.user?.role !== 'admin') {
        throw errorMiddleware.createForbiddenError('Only administrators can create clients');
      }
      
      const clientData = CreateClientSchema.parse(req.body);
      
      // Check if client with same name already exists
      const existingClient = await clientRepository.findByName(clientData.name);
      if (existingClient) {
        throw errorMiddleware.createValidationError('name', 'Client with this name already exists');
      }
      
      // Create client
      const client = await clientRepository.create({
        name: clientData.name,
        description: clientData.description,
        brand_names: clientData.brandNames,
        competitor_names: clientData.competitorNames || [],
        keywords: clientData.keywords,
        is_active: clientData.isActive,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      logger.info('Client created', {
        clientId: client.id,
        clientName: client.name,
        userId: req.user.id,
        requestId: (req as any).requestId,
      });
      
      const formattedClient = {
        id: client.id,
        name: client.name,
        description: client.description,
        brandNames: client.brand_names,
        competitorNames: client.competitor_names,
        keywords: client.keywords,
        isActive: client.is_active,
        createdAt: client.created_at,
        updatedAt: client.updated_at,
      };
      
      return res.status(201).success(formattedClient, {
        message: 'Client created successfully',
      });
    }
  );
  
  /**
   * Update existing client
   * PUT /api/v1/clients/:id
   */
  updateClient = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientId = parseInt(req.params.id);
      
      // Check if client exists
      const existingClient = await clientRepository.findById(clientId);
      if (!existingClient) {
        throw errorMiddleware.createNotFoundError('Client', clientId);
      }
      
      // Check permissions (admin or client owner)
      if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(clientId)) {
        throw errorMiddleware.createForbiddenError('Access denied to this client');
      }
      
      const updateData = UpdateClientSchema.parse(req.body);
      
      // If name is being changed, check for duplicates
      if (updateData.name && updateData.name !== existingClient.name) {
        const duplicateClient = await clientRepository.findByName(updateData.name);
        if (duplicateClient) {
          throw errorMiddleware.createValidationError('name', 'Client with this name already exists');
        }
      }
      
      // Update client
      const success = await clientRepository.update(clientId, {
        name: updateData.name,
        description: updateData.description,
        brand_names: updateData.brandNames,
        competitor_names: updateData.competitorNames,
        keywords: updateData.keywords,
        is_active: updateData.isActive,
        updated_at: new Date().toISOString(),
      });
      
      if (!success) {
        throw new Error('Failed to update client');
      }
      
      // Get updated client
      const updatedClient = await clientRepository.findById(clientId);
      
      logger.info('Client updated', {
        clientId,
        clientName: updatedClient!.name,
        userId: req.user?.id,
        changes: Object.keys(updateData),
        requestId: (req as any).requestId,
      });
      
      const formattedClient = {
        id: updatedClient!.id,
        name: updatedClient!.name,
        description: updatedClient!.description,
        brandNames: updatedClient!.brand_names,
        competitorNames: updatedClient!.competitor_names,
        keywords: updatedClient!.keywords,
        isActive: updatedClient!.is_active,
        createdAt: updatedClient!.created_at,
        updatedAt: updatedClient!.updated_at,
      };
      
      return res.success(formattedClient, {
        message: 'Client updated successfully',
      });
    }
  );
  
  /**
   * Delete client (soft delete by setting inactive)
   * DELETE /api/v1/clients/:id
   */
  deleteClient = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientId = parseInt(req.params.id);
      
      // Only admin users can delete clients
      if (req.user?.role !== 'admin') {
        throw errorMiddleware.createForbiddenError('Only administrators can delete clients');
      }
      
      // Check if client exists
      const existingClient = await clientRepository.findById(clientId);
      if (!existingClient) {
        throw errorMiddleware.createNotFoundError('Client', clientId);
      }
      
      // Soft delete by setting inactive
      const success = await clientRepository.update(clientId, {
        is_active: false,
        updated_at: new Date().toISOString(),
      });
      
      if (!success) {
        throw new Error('Failed to delete client');
      }
      
      logger.info('Client deleted (soft)', {
        clientId,
        clientName: existingClient.name,
        userId: req.user.id,
        requestId: (req as any).requestId,
      });
      
      return res.success({
        message: 'Client deleted successfully',
        clientId,
        clientName: existingClient.name,
      });
    }
  );
  
  /**
   * Get client monitoring statistics
   * GET /api/v1/clients/:id/stats
   */
  getClientStats = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientId = parseInt(req.params.id);
      const { days = 30 } = req.query as any;
      
      // Check if client exists and user has access
      const client = await clientRepository.findById(clientId);
      if (!client) {
        throw errorMiddleware.createNotFoundError('Client', clientId);
      }
      
      if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(clientId)) {
        throw errorMiddleware.createForbiddenError('Access denied to this client');
      }
      
      // Get comprehensive statistics
      const stats = await clientRepository.getDetailedStats(clientId, parseInt(days));
      
      return res.success(stats, {
        clientId,
        clientName: client.name,
        period: `${days} days`,
      });
    }
  );
  
  /**
   * Toggle client active status
   * PATCH /api/v1/clients/:id/toggle-status
   */
  toggleClientStatus = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientId = parseInt(req.params.id);
      
      // Check if client exists
      const existingClient = await clientRepository.findById(clientId);
      if (!existingClient) {
        throw errorMiddleware.createNotFoundError('Client', clientId);
      }
      
      // Check permissions
      if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(clientId)) {
        throw errorMiddleware.createForbiddenError('Access denied to this client');
      }
      
      // Toggle status
      const newStatus = !existingClient.is_active;
      const success = await clientRepository.update(clientId, {
        is_active: newStatus,
        updated_at: new Date().toISOString(),
      });
      
      if (!success) {
        throw new Error('Failed to toggle client status');
      }
      
      logger.info('Client status toggled', {
        clientId,
        clientName: existingClient.name,
        oldStatus: existingClient.is_active,
        newStatus,
        userId: req.user?.id,
        requestId: (req as any).requestId,
      });
      
      return res.success({
        clientId,
        clientName: existingClient.name,
        isActive: newStatus,
        message: `Client ${newStatus ? 'activated' : 'deactivated'} successfully`,
      });
    }
  );
  
  /**
   * Get client brands and competitors
   * GET /api/v1/clients/:id/brands-competitors
   */
  getBrandsAndCompetitors = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const clientId = parseInt(req.params.id);
      
      const client = await clientRepository.findById(clientId);
      if (!client) {
        throw errorMiddleware.createNotFoundError('Client', clientId);
      }
      
      if (req.user?.role !== 'admin' && !req.user?.clientIds?.includes(clientId)) {
        throw errorMiddleware.createForbiddenError('Access denied to this client');
      }
      
      const data = {
        clientId,
        clientName: client.name,
        brandNames: client.brand_names || [],
        competitorNames: client.competitor_names || [],
        keywords: client.keywords || [],
        totalBrands: (client.brand_names || []).length,
        totalCompetitors: (client.competitor_names || []).length,
        totalKeywords: (client.keywords || []).length,
      };
      
      return res.success(data);
    }
  );
}

// Export singleton instance
export const clientsController = new ClientsController();