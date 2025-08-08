import { Router } from 'express';
import { healthController } from '../controllers/health.controller';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { responseMiddleware } from '../middleware/response.middleware';

const router = Router();

// Health routes don't require authentication but have rate limiting
router.use(rateLimitMiddleware.perIp(60, 60000)); // 60 requests per minute per IP

/**
 * @route GET /api/v1/health
 * @desc Basic health check endpoint
 * @access Public
 */
router.get('/',
  responseMiddleware.setCacheControl(10), // Short cache for health checks
  healthController.getHealth
);

/**
 * @route GET /api/v1/health/detailed
 * @desc Detailed health check with system metrics
 * @access Public
 */
router.get('/detailed',
  rateLimitMiddleware.perIp(30, 60000), // More restrictive for detailed health
  responseMiddleware.setCacheControl(30), // 30 second cache
  healthController.getDetailedHealth
);

/**
 * @route GET /api/v1/health/ready
 * @desc Kubernetes readiness probe
 * @access Public
 */
router.get('/ready',
  responseMiddleware.setCacheControl(5), // Very short cache for readiness
  healthController.getReadiness
);

/**
 * @route GET /api/v1/health/live
 * @desc Kubernetes liveness probe
 * @access Public
 */
router.get('/live',
  responseMiddleware.setCacheControl(5), // Very short cache for liveness
  healthController.getLiveness
);

/**
 * @route GET /api/v1/health/database
 * @desc Database connection health check
 * @access Public
 */
router.get('/database',
  rateLimitMiddleware.perIp(30, 60000), // Limit database checks
  responseMiddleware.setCacheControl(30), // 30 second cache
  healthController.getDatabaseHealth
);

/**
 * @route GET /api/v1/health/platforms
 * @desc Platform availability health check
 * @access Public
 */
router.get('/platforms',
  rateLimitMiddleware.perIp(30, 60000), // Limit platform checks
  responseMiddleware.setCacheControl(60), // 1 minute cache
  healthController.getPlatformHealth
);

/**
 * @route GET /api/v1/health/metrics
 * @desc Application metrics endpoint
 * @access Public
 */
router.get('/metrics',
  rateLimitMiddleware.perIp(10, 60000), // More restrictive for metrics
  responseMiddleware.setCacheControl(30), // 30 second cache
  healthController.getMetrics
);

// Export router
export { router as healthRoutes };