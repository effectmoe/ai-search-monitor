import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

import { apiRoutes } from './routes';
import { errorMiddleware } from './middleware/error.middleware';
import { mockDatabase } from '../database/mock-database';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

class APIServer {
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
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
      credentials: true,
      maxAge: 86400, // 24 hours
    }));

    // Compression
    this.app.use(compression({
      level: 6,
      threshold: 1024, // Only compress responses larger than 1KB
      filter: (req, res) => {
        // Don't compress if the request includes a cache-control header to not compress
        if (req.headers['x-no-compression']) {
          return false;
        }
        // Use compression filter
        return compression.filter(req, res);
      },
    }));

    // Body parsing
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
  }

  /**
   * Initialize routes
   */
  private initializeRoutes(): void {
    // Health check route (before main API routes)
    this.app.get('/ping', (_req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // API routes
    this.app.use('/api', apiRoutes);

    // Catch 404 for undefined routes
    this.app.all('*', errorMiddleware.notFound);
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Global error handler (must be last)
    this.app.use(errorMiddleware.handle);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      });
      
      // Graceful shutdown
      this.gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason,
        promise: promise,
      });
      
      // Graceful shutdown
      this.gracefulShutdown('unhandledRejection');
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received');
      this.gracefulShutdown('SIGINT');
    });
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
        logger.info(`AI Search Monitor API Server started`, {
          port: this.port,
          env: process.env.NODE_ENV || 'development',
          pid: process.pid,
          version: process.env.npm_package_version || '1.0.0',
        });

        // Log configuration in development
        if (process.env.NODE_ENV !== 'production') {
          logger.info('Server configuration', {
            allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            trustProxy: process.env.TRUST_PROXY || 'disabled',
            maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
            jwtSecret: process.env.JWT_SECRET ? '[SET]' : '[NOT SET]',
          });
        }
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

      // Store server reference for graceful shutdown
      (this as any).server = server;

    } catch (error: any) {
      logger.error('Failed to start server', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  private gracefulShutdown(signal: string): void {
    logger.info(`Graceful shutdown initiated by ${signal}`);

    const server = (this as any).server;
    if (server) {
      server.close((error: any) => {
        if (error) {
          logger.error('Error during server shutdown', {
            error: error.message,
          });
        } else {
          logger.info('Server closed successfully');
        }

        // Close database connections if needed
        // TODO: Add database connection cleanup here

        process.exit(error ? 1 : 0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forcing shutdown after timeout');
        process.exit(1);
      }, 10000); // 10 second timeout
    } else {
      process.exit(0);
    }
  }

  /**
   * Get Express app instance
   */
  public getApp(): express.Application {
    return this.app;
  }
}

// Create server instance
const apiServer = new APIServer();

// Start server if this file is run directly
if (require.main === module) {
  apiServer.start().catch((error) => {
    logger.error('Failed to start API server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

// Export for testing
export { apiServer, APIServer };
export default apiServer;