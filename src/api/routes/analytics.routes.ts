import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { responseMiddleware } from '../middleware/response.middleware';

const router = Router();

// Apply authentication to all analytics routes
router.use(authMiddleware.authenticate);

// Apply analytics-specific rate limiting
router.use(rateLimitMiddleware.perUser(300, 60000)); // 300 requests per minute per user

/**
 * @route GET /api/v1/analytics/dashboard
 * @desc Get comprehensive analytics dashboard data
 * @access Private (requires authentication)
 */
router.get('/dashboard',
  authMiddleware.requirePermission('analytics:read'),
  responseMiddleware.setCacheControl(120), // Cache for 2 minutes
  analyticsController.getDashboard
);

/**
 * @route GET /api/v1/analytics/clients/:clientId/metrics
 * @desc Get metrics for specific client
 * @access Private (requires authentication + client access)
 */
router.get('/clients/:clientId/metrics',
  validationMiddleware.validateId('clientId'),
  validationMiddleware.validateDateRange(),
  validationMiddleware.validatePlatform(),
  authMiddleware.requireClientAccess,
  authMiddleware.requirePermission('analytics:read'),
  responseMiddleware.setCacheControl(300), // Cache for 5 minutes
  analyticsController.getClientMetrics
);

/**
 * @route GET /api/v1/analytics/platforms/comparison
 * @desc Get platform comparison analytics
 * @access Private (requires authentication)
 */
router.get('/platforms/comparison',
  validationMiddleware.validateDateRange(),
  authMiddleware.requirePermission('analytics:read'),
  responseMiddleware.setCacheControl(600), // Cache for 10 minutes
  analyticsController.getPlatformComparison
);

/**
 * @route GET /api/v1/analytics/brand-mentions
 * @desc Get brand mention analysis
 * @access Private (requires authentication)
 */
router.get('/brand-mentions',
  validationMiddleware.validateDateRange(),
  authMiddleware.requirePermission('analytics:read'),
  responseMiddleware.setCacheControl(300), // Cache for 5 minutes
  analyticsController.getBrandMentionAnalysis
);

/**
 * @route GET /api/v1/analytics/visibility-trends
 * @desc Get visibility score trends
 * @access Private (requires authentication)
 */
router.get('/visibility-trends',
  validationMiddleware.validateDateRange(),
  authMiddleware.requirePermission('analytics:read'),
  responseMiddleware.setCacheControl(300), // Cache for 5 minutes
  analyticsController.getVisibilityTrends
);

/**
 * @route GET /api/v1/analytics/export
 * @desc Export analytics data
 * @access Private (requires authentication)
 * @ratelimit 5 requests per hour per user
 */
router.get('/export',
  rateLimitMiddleware.perEndpoint(5, 3600000), // 5 exports per hour
  validationMiddleware.validateDateRange(),
  authMiddleware.requirePermission('analytics:export'),
  responseMiddleware.setCacheControl(0), // No caching for exports
  analyticsController.exportData
);

// Export router
export { router as analyticsRoutes };