import { Router } from 'express';
import { monitoringRoutes } from './monitoring.routes';
import { clientsRoutes } from './clients.routes';
import { analyticsRoutes } from './analytics.routes';
import { healthRoutes } from './health.routes';
import { authRoutes } from './auth.routes';
import { responseMiddleware } from '../middleware/response.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';

const router = Router();

// Apply common middleware
router.use(responseMiddleware.enhanceResponse);
router.use(responseMiddleware.addSecurityHeaders);
router.use(responseMiddleware.addCorsHeaders);
router.use(responseMiddleware.logRequests);
router.use(responseMiddleware.addRequestId);

// Global rate limiting (more permissive)
router.use(rateLimitMiddleware.global(1000, 60000)); // 1000 requests per minute globally

// Content validation
router.use(validationMiddleware.validateContentType());
router.use(validationMiddleware.sanitizeInput());

// API versioning - v1 routes
const v1Router = Router();

// Health routes (no authentication required)
v1Router.use('/health', healthRoutes);

// Authentication routes
v1Router.use('/auth', authRoutes);

// Protected API routes (authentication required)
v1Router.use('/monitoring', monitoringRoutes);
v1Router.use('/clients', clientsRoutes);
v1Router.use('/analytics', analyticsRoutes);

// Mount v1 routes
router.use('/v1', v1Router);

// Root route
router.get('/', (req, res) => {
  res.success({
    name: 'AI Search Monitor API',
    version: '1.0.0',
    description: 'RESTful API for monitoring AI platform search results',
    documentation: `${req.protocol}://${req.get('host')}/docs`,
    health: `${req.protocol}://${req.get('host')}/api/v1/health`,
    endpoints: {
      auth: '/api/v1/auth',
      monitoring: '/api/v1/monitoring',
      clients: '/api/v1/clients',
      analytics: '/api/v1/analytics',
      health: '/api/v1/health',
    },
    features: [
      'Real-time AI platform monitoring',
      'Brand mention tracking',
      'Visibility scoring',
      'Competitive analysis',
      'Historical analytics',
      'RESTful API with OpenAPI documentation',
    ],
  }, {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API documentation route
router.get('/docs', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'AI Search Monitor API',
      version: '1.0.0',
      description: 'RESTful API for monitoring AI platform search results and brand mentions',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: `${req.protocol}://${req.get('host')}/api/v1`,
        description: 'Production server',
      },
    ],
    paths: {
      // This would contain full OpenAPI specification
      // For brevity, showing just the structure
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  });
});

export { router as apiRoutes };