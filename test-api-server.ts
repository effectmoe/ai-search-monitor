/**
 * Simple API server for testing authentication and basic functionality
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Use require for imports to avoid module resolution issues with ts-node
const { mockDatabase } = require('./src/database/mock-database');
const { logger } = require('./src/utils/logger');
const { authController } = require('./src/api/controllers/auth.controller');
const { authMiddleware } = require('./src/api/middleware/auth.middleware');
const { rateLimitMiddleware } = require('./src/api/middleware/rate-limit.middleware');
const { errorMiddleware } = require('./src/api/middleware/error.middleware');

// Load environment variables
dotenv.config();

class TestAPIServer {
  private app: express.Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.API_PORT || '3001');
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize middleware
   */
  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable for testing
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
      credentials: true,
    }));

    // Compression middleware
    this.app.use(compression());

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: process.env.MAX_REQUEST_SIZE || '10mb',
      strict: true,
    }));
    
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: process.env.MAX_REQUEST_SIZE || '10mb',
    }));

    // Trust proxy (important for rate limiting and IP detection)
    if (process.env.TRUST_PROXY) {
      this.app.set('trust proxy', process.env.TRUST_PROXY);
    }

    // Disable X-Powered-By header
    this.app.disable('x-powered-by');

    // Add custom response methods to Express
    this.app.use((_req, res, next) => {
      // Success response
      (res as any).success = function(data?: any, meta?: any) {
        return res.json({
          success: true,
          data,
          metadata: {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            ...meta,
          },
        });
      };

      // Error response
      (res as any).error = function(code: string, message: string, statusCode = 400, details?: any) {
        return res.status(statusCode).json({
          success: false,
          error: {
            code,
            message,
            details,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
          },
        });
      };

      next();
    });
  }

  /**
   * Initialize routes
   */
  private initializeRoutes(): void {
    // Health check route
    this.app.get('/ping', (_req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        kvReady: false, // Since we're using fallback
        mockDatabase: true,
      });
    });

    // API v1 routes
    const v1Router = express.Router();

    // Apply rate limiting to all API routes (per IP, 100 requests per minute)
    v1Router.use(rateLimitMiddleware.perIp(100, 60000));

    // Auth routes (no authentication required)
    v1Router.post('/auth/login', authController.login);
    v1Router.post('/auth/refresh', authController.refreshToken);
    v1Router.post('/auth/password-reset-request', authController.requestPasswordReset);
    v1Router.post('/auth/password-reset', authController.resetPassword);
    v1Router.post('/auth/verify-token', authMiddleware.authenticate, authController.verifyToken);

    // Protected routes (authentication required)
    v1Router.get('/auth/me', authMiddleware.authenticate, authController.getCurrentUser);
    v1Router.post('/auth/logout', authMiddleware.authenticate, authController.logout);

    // Database test routes (protected)
    v1Router.get('/test/clients', authMiddleware.authenticate, async (_req: any, res: any) => {
      try {
        const clients = await mockDatabase.getAllClients();
        return (res as any).success({
          clients,
          count: clients.length,
        });
      } catch (error: any) {
        return (res as any).error('DATABASE_ERROR', error.message, 500);
      }
    });

    v1Router.get('/test/database-health', authMiddleware.authenticate, async (_req: any, res: any) => {
      try {
        const health = await mockDatabase.healthCheck();
        return (res as any).success(health);
      } catch (error: any) {
        return (res as any).error('DATABASE_ERROR', error.message, 500);
      }
    });

    // Mount API routes
    this.app.use('/api/v1', v1Router);

    // API info route
    this.app.get('/api', (_req, res) => {
      res.json({
        name: 'AI Search Monitor API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/ping',
          auth: {
            login: 'POST /api/v1/auth/login',
            refresh: 'POST /api/v1/auth/refresh',
            me: 'GET /api/v1/auth/me',
            logout: 'POST /api/v1/auth/logout',
            passwordReset: 'POST /api/v1/auth/password-reset-request',
            resetPassword: 'POST /api/v1/auth/password-reset',
            verifyToken: 'POST /api/v1/auth/verify-token',
          },
          test: {
            clients: 'GET /api/v1/test/clients',
            databaseHealth: 'GET /api/v1/test/database-health',
          },
        },
        authentication: {
          defaultUsers: [
            { email: 'admin@example.com', role: 'admin' },
            { email: 'user@example.com', role: 'user' },
            { email: 'readonly@example.com', role: 'readonly' },
          ],
          defaultPassword: process.env.NODE_ENV === 'production' ? '[HIDDEN]' : (process.env.DEFAULT_PASSWORD || 'password123'),
        },
      });
    });

    // Catch 404 for undefined routes
    this.app.all('*', errorMiddleware.notFound);
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Global error handler (must be last)
    this.app.use(errorMiddleware.handle);
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Initialize mock database
      logger.info('Initializing mock database...');
      await mockDatabase.connect();
      logger.info('Mock database initialized successfully');

      // Start HTTP server
      const server = this.app.listen(this.port, () => {
        logger.info(`Test API Server started`, {
          port: this.port,
          env: process.env.NODE_ENV || 'development',
          pid: process.pid,
          endpoints: {
            ping: `http://localhost:${this.port}/ping`,
            api: `http://localhost:${this.port}/api`,
            login: `http://localhost:${this.port}/api/v1/auth/login`,
          },
        });
      });

      // Handle server errors
      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${this.port} is already in use`);
          process.exit(1);
        } else {
          logger.error('Server error', {
            error: error.message,
            code: error.code,
          });
        }
      });

    } catch (error: any) {
      logger.error('Failed to start server', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    }
  }
}

// Start the server
if (require.main === module) {
  const server = new TestAPIServer();
  server.start().catch((error) => {
    console.error('Server startup failed:', error);
    process.exit(1);
  });
}

export { TestAPIServer };