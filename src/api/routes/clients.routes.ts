import { Router } from 'express';
import { clientsController } from '../controllers/clients.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { responseMiddleware } from '../middleware/response.middleware';
import { CreateClientSchema, UpdateClientSchema } from '../types/api.types';

const router = Router();

// Apply authentication to all client routes
router.use(authMiddleware.authenticate);

// Apply client management rate limiting
router.use(rateLimitMiddleware.perUser(200, 60000)); // 200 requests per minute per user

/**
 * @route GET /api/v1/clients
 * @desc Get all clients with pagination and filtering
 * @access Private (requires authentication)
 */
router.get('/',
  validationMiddleware.validatePagination(),
  authMiddleware.requirePermission('clients:read'),
  responseMiddleware.setCacheControl(60), // Cache for 1 minute
  clientsController.getClients
);

/**
 * @route GET /api/v1/clients/:id
 * @desc Get specific client by ID
 * @access Private (requires authentication + client access)
 */
router.get('/:id',
  validationMiddleware.validateId('id'),
  authMiddleware.requirePermission('clients:read'),
  responseMiddleware.setCacheControl(60), // Cache for 1 minute
  clientsController.getClientById
);

/**
 * @route POST /api/v1/clients
 * @desc Create new client
 * @access Private (requires admin role)
 * @ratelimit 10 requests per hour per user
 */
router.post('/',
  rateLimitMiddleware.perEndpoint(10, 3600000), // 10 per hour for creation
  validationMiddleware.validateBody(CreateClientSchema),
  authMiddleware.requireRole('admin'),
  authMiddleware.requirePermission('clients:create'),
  responseMiddleware.setCacheControl(0), // No caching for creation
  clientsController.createClient
);

/**
 * @route PUT /api/v1/clients/:id
 * @desc Update existing client
 * @access Private (requires authentication + client access or admin)
 * @ratelimit 20 requests per hour per user
 */
router.put('/:id',
  rateLimitMiddleware.perEndpoint(20, 3600000), // 20 per hour for updates
  validationMiddleware.validateId('id'),
  validationMiddleware.validateBody(UpdateClientSchema),
  authMiddleware.requirePermission('clients:update'),
  responseMiddleware.setCacheControl(0), // No caching for updates
  clientsController.updateClient
);

/**
 * @route DELETE /api/v1/clients/:id
 * @desc Delete client (soft delete)
 * @access Private (requires admin role)
 * @ratelimit 5 requests per hour per user
 */
router.delete('/:id',
  rateLimitMiddleware.perEndpoint(5, 3600000), // 5 per hour for deletion
  validationMiddleware.validateId('id'),
  authMiddleware.requireRole('admin'),
  authMiddleware.requirePermission('clients:delete'),
  responseMiddleware.setCacheControl(0), // No caching for deletion
  clientsController.deleteClient
);

/**
 * @route GET /api/v1/clients/:id/stats
 * @desc Get client monitoring statistics
 * @access Private (requires authentication + client access)
 */
router.get('/:id/stats',
  validationMiddleware.validateId('id'),
  authMiddleware.requirePermission('clients:read'),
  responseMiddleware.setCacheControl(120), // Cache for 2 minutes
  clientsController.getClientStats
);

/**
 * @route PATCH /api/v1/clients/:id/toggle-status
 * @desc Toggle client active status
 * @access Private (requires authentication + client access or admin)
 * @ratelimit 10 requests per hour per user
 */
router.patch('/:id/toggle-status',
  rateLimitMiddleware.perEndpoint(10, 3600000), // 10 per hour for status changes
  validationMiddleware.validateId('id'),
  authMiddleware.requirePermission('clients:update'),
  responseMiddleware.setCacheControl(0), // No caching for status changes
  clientsController.toggleClientStatus
);

/**
 * @route GET /api/v1/clients/:id/brands-competitors
 * @desc Get client brands and competitors list
 * @access Private (requires authentication + client access)
 */
router.get('/:id/brands-competitors',
  validationMiddleware.validateId('id'),
  authMiddleware.requirePermission('clients:read'),
  responseMiddleware.setCacheControl(300), // Cache for 5 minutes
  clientsController.getBrandsAndCompetitors
);

// Export router
export { router as clientsRoutes };