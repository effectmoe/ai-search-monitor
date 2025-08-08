import { Router } from 'express';
import { monitoringController } from '../controllers/monitoring.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { responseMiddleware } from '../middleware/response.middleware';

const router = Router();

// Apply authentication to all monitoring routes
router.use(authMiddleware.authenticate);

// Apply monitoring-specific rate limiting
router.use(rateLimitMiddleware.perUser(100, 60000)); // 100 requests per minute per user

/**
 * @route POST /api/v1/monitoring/start
 * @desc Start monitoring for specified clients and platforms
 * @access Private (requires authentication)
 * @ratelimit 10 requests per minute per user
 */
router.post('/start', 
  rateLimitMiddleware.perEndpoint(10, 60000), // More restrictive for workflow execution
  authMiddleware.requirePermission('monitoring:execute'),
  responseMiddleware.setCacheControl(0), // No caching for start requests
  monitoringController.startMonitoring
);

/**
 * @route GET /api/v1/monitoring/status
 * @desc Get current monitoring status for all platforms
 * @access Private (requires authentication)
 */
router.get('/status',
  authMiddleware.requirePermission('monitoring:read'),
  responseMiddleware.setCacheControl(30), // Cache for 30 seconds
  monitoringController.getMonitoringStatus
);

/**
 * @route GET /api/v1/monitoring/history/:clientId
 * @desc Get monitoring history for a specific client
 * @access Private (requires authentication + client access)
 */
router.get('/history/:clientId',
  validationMiddleware.validateId('clientId'),
  validationMiddleware.validatePagination(),
  validationMiddleware.validateDateRange(),
  validationMiddleware.validatePlatform(),
  authMiddleware.requireClientAccess,
  responseMiddleware.setCacheControl(60), // Cache for 1 minute
  monitoringController.getMonitoringHistory
);

/**
 * @route POST /api/v1/monitoring/stop
 * @desc Stop monitoring for specific clients
 * @access Private (requires authentication + client access)
 * @ratelimit 5 requests per minute per user
 */
router.post('/stop',
  rateLimitMiddleware.perEndpoint(5, 60000), // Limit stop requests
  authMiddleware.requirePermission('monitoring:execute'),
  responseMiddleware.setCacheControl(0), // No caching for stop requests
  monitoringController.stopMonitoring
);

/**
 * @route GET /api/v1/monitoring/metrics/realtime
 * @desc Get real-time monitoring metrics
 * @access Private (requires authentication)
 */
router.get('/metrics/realtime',
  authMiddleware.requirePermission('monitoring:read'),
  validationMiddleware.validatePlatform(),
  responseMiddleware.setCacheControl(10), // Short cache for real-time data
  monitoringController.getRealtimeMetrics
);

// Export router
export { router as monitoringRoutes };