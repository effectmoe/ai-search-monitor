/**
 * Enhanced API server with metrics integration
 * Combines authentication and metrics system
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { MetricsService } from './src/evaluation/MetricsService';
import { mockDatabase } from './src/database/mock-database';
import { logger } from './src/utils/logger';

// Load environment variables
dotenv.config();

class MetricsApiServer {
  private app: express.Application;
  private port: number;
  private metricsService: MetricsService;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.API_PORT || '3002');
    this.metricsService = new MetricsService({
      database: mockDatabase,
      enableRealTimeAnalysis: true,
      metricsRetentionDays: 30,
      costPerToken: 0.001, // 0.001 yen per token
    });
    this.initializeMiddleware();
    this.initializeRoutes();
  }

  private initializeMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private authenticateToken(req: any, res: any, next: any): any {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'NO_TOKEN', message: 'Access token required' }
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
      req.user = decoded;
      return next();
    } catch (error) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
      });
    }
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/ping', (_req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        authentication: 'ready',
        metrics: 'ready',
      });
    });

    // API info
    this.app.get('/api', (_req, res) => {
      res.json({
        name: 'AI Search Monitor API with Metrics',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/ping',
          login: 'POST /auth/login',
          me: 'GET /auth/me',
          testClients: 'GET /test/clients',
          // Metrics endpoints
          startQuery: 'POST /metrics/query/start',
          completeQuery: 'POST /metrics/query/complete',
          dailyReport: 'GET /metrics/reports/daily',
          platformComparison: 'GET /metrics/platforms/comparison',
          systemHealth: 'GET /metrics/system/health',
          exportData: 'GET /metrics/export',
        },
        testUsers: [
          { email: 'admin@example.com', password: 'password123', role: 'admin' },
          { email: 'user@example.com', password: 'password123', role: 'user' },
        ],
      });
    });

    // Authentication routes
    this.app.post('/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;

        const testUsers = [
          { id: 1, email: 'admin@example.com', password: 'password123', role: 'admin' },
          { id: 2, email: 'user@example.com', password: 'password123', role: 'user' },
        ];

        const user = testUsers.find(u => u.email === email && u.password === password);
        
        if (!user) {
          return res.status(401).json({
            success: false,
            error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
          });
        }

        const token = jwt.sign(
          { userId: user.id, email: user.email, role: user.role },
          process.env.JWT_SECRET || 'test-secret',
          { expiresIn: '1h' }
        );

        return res.json({
          success: true,
          data: {
            token,
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
            },
          },
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'AUTH_ERROR', message: error.message },
        });
      }
    });

    this.app.get('/auth/me', this.authenticateToken, (req: any, res) => {
      res.json({
        success: true,
        data: { user: req.user },
      });
    });

    // Database test route
    this.app.get('/test/clients', async (_req, res) => {
      try {
        const clients = await mockDatabase.getAllClients();
        res.json({
          success: true,
          data: { clients, count: clients.length },
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: { code: 'DATABASE_ERROR', message: error.message },
        });
      }
    });

    // === METRICS ENDPOINTS ===
    
    // Start query tracking
    this.app.post('/metrics/query/start', this.authenticateToken, (req: any, res) => {
      try {
        const { queryId, platform, clientId, searchQuery, brandKeywords, expectedMentions } = req.body;

        if (!queryId || !platform || !clientId || !searchQuery || !brandKeywords) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_PARAMETERS', message: 'Required parameters missing' }
          });
        }

        this.metricsService.startQueryTracking(
          queryId,
          platform,
          clientId,
          searchQuery,
          brandKeywords,
          expectedMentions
        );

        return res.json({
          success: true,
          data: { message: 'Query tracking started', queryId }
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'METRICS_ERROR', message: error.message }
        });
      }
    });

    // Complete query tracking
    this.app.post('/metrics/query/complete', this.authenticateToken, async (req: any, res) => {
      try {
        const { queryId, success, response, errorCode, errorMessage, tokensUsed, apiLatency } = req.body;

        if (!queryId || success === undefined) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_PARAMETERS', message: 'QueryId and success status required' }
          });
        }

        const result = await this.metricsService.completeQueryTracking(queryId, {
          success,
          response,
          errorCode,
          errorMessage,
          tokensUsed,
          apiLatency,
        });

        if (!result) {
          return res.status(404).json({
            success: false,
            error: { code: 'QUERY_NOT_FOUND', message: 'Query tracking not found' }
          });
        }

        return res.json({
          success: true,
          data: { metrics: result }
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'METRICS_ERROR', message: error.message }
        });
      }
    });

    // Get daily report
    this.app.get('/metrics/reports/daily', this.authenticateToken, async (req: any, res) => {
      try {
        const dateStr = req.query.date as string;
        const date = dateStr ? new Date(dateStr) : new Date();

        const report = await this.metricsService.generateDailyReport(date);
        
        return res.json({
          success: true,
          data: { report }
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'REPORT_ERROR', message: error.message }
        });
      }
    });

    // Get platform comparison
    this.app.get('/metrics/platforms/comparison', this.authenticateToken, async (req: any, res) => {
      try {
        const { startDate, endDate } = req.query;
        
        const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate as string) : new Date();

        const comparison = await this.metricsService.getPlatformComparison(start, end);
        
        return res.json({
          success: true,
          data: { comparison, period: { startDate: start, endDate: end } }
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'COMPARISON_ERROR', message: error.message }
        });
      }
    });

    // Get system health metrics
    this.app.get('/metrics/system/health', this.authenticateToken, (_req: any, res) => {
      try {
        const health = this.metricsService.getSystemHealthMetrics();
        
        return res.json({
          success: true,
          data: { health }
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'HEALTH_ERROR', message: error.message }
        });
      }
    });

    // Export metrics data
    this.app.get('/metrics/export', this.authenticateToken, async (req: any, res) => {
      try {
        const { startDate, endDate, format = 'csv' } = req.query;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_DATES', message: 'Start and end dates required' }
          });
        }

        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        const exportFormat = format as 'csv' | 'json';

        const data = await this.metricsService.exportMetrics(start, end, exportFormat);
        
        if (exportFormat === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename=metrics-export.csv');
          return res.send(data);
        } else {
          return res.json({
            success: true,
            data: JSON.parse(data)
          });
        }
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'EXPORT_ERROR', message: error.message }
        });
      }
    });

    // Get client-specific metrics
    this.app.get('/metrics/clients/:clientId', this.authenticateToken, async (req: any, res) => {
      try {
        const clientId = parseInt(req.params.clientId);
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_DATES', message: 'Start and end dates required' }
          });
        }

        const start = new Date(startDate as string);
        const end = new Date(endDate as string);

        const metrics = await this.metricsService.getClientMetrics(clientId, start, end);
        
        return res.json({
          success: true,
          data: { clientId, metrics, count: metrics.length }
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'CLIENT_METRICS_ERROR', message: error.message }
        });
      }
    });
  }

  public async start(): Promise<void> {
    try {
      await mockDatabase.connect();
      logger.info('Database connected for metrics API');

      const server = this.app.listen(this.port, () => {
        console.log(`✅ AI Search Monitor API with Metrics started on port ${this.port}`);
        console.log(`   Health: http://localhost:${this.port}/ping`);
        console.log(`   API Info: http://localhost:${this.port}/api`);
        console.log(`   Login: POST http://localhost:${this.port}/auth/login`);
        console.log(`   Metrics: http://localhost:${this.port}/metrics/*`);
        console.log('');
        console.log('📊 New Metrics Endpoints:');
        console.log(`   - POST /metrics/query/start`);
        console.log(`   - POST /metrics/query/complete`);
        console.log(`   - GET /metrics/reports/daily`);
        console.log(`   - GET /metrics/platforms/comparison`);
        console.log(`   - GET /metrics/system/health`);
        console.log(`   - GET /metrics/export`);
        console.log(`   - GET /metrics/clients/:clientId`);
      });

      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${this.port} is already in use`);
          process.exit(1);
        } else {
          console.error('❌ Server error:', error.message);
        }
      });

      process.on('SIGINT', () => {
        console.log('\n👋 Shutting down metrics API server...');
        server.close(() => {
          console.log('✅ Server closed');
          process.exit(0);
        });
      });

    } catch (error: any) {
      console.error('❌ Failed to start metrics API server:', error.message);
      process.exit(1);
    }
  }
}

// Start the server
if (require.main === module) {
  const server = new MetricsApiServer();
  server.start().catch((error) => {
    console.error('❌ Metrics API server startup failed:', error);
    process.exit(1);
  });
}

export { MetricsApiServer };