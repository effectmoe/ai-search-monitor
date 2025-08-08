/**
 * Production API Server for AI Search Monitor with Metrics
 * Vercel Serverless Functions compatible
 */
import { VercelRequest, VercelResponse } from '@vercel/node';
import { MetricsService } from '../src/evaluation/MetricsService';
import { mockDatabase } from '../src/database/mock-database';
import { logger } from '../src/utils/logger';
import jwt from 'jsonwebtoken';

// Initialize metrics service
const metricsService = new MetricsService({
  database: mockDatabase,
  enableRealTimeAnalysis: true,
  metricsRetentionDays: 30,
  costPerToken: 0.001, // 0.001 yen per token
});

// Initialize database connection
let isDbInitialized = false;

const initializeDatabase = async () => {
  if (!isDbInitialized) {
    await mockDatabase.connect();
    isDbInitialized = true;
    logger.info('Database initialized for production API');
  }
};

// Authentication helper
const authenticateToken = (req: VercelRequest): { success: boolean; user?: any; error?: string } => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return { success: false, error: 'Access token required' };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
    return { success: true, user: decoded };
  } catch (error) {
    return { success: false, error: 'Invalid or expired token' };
  }
};

// CORS helper
const setCorsHeaders = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await initializeDatabase();

    const { method, url } = req;
    const path = url?.split('?')[0] || '';

    // Route handling
    switch (method) {
      case 'GET':
        return await handleGetRequest(req, res, path);
      case 'POST':
        return await handlePostRequest(req, res, path);
      default:
        return res.status(405).json({
          success: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
        });
    }

  } catch (error: any) {
    logger.error('API Handler Error', { error: error.message, path: req.url });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handleGetRequest(req: VercelRequest, res: VercelResponse, path: string) {
  switch (path) {
    case '/':
    case '/api':
      return res.json({
        name: 'AI Search Monitor API with Metrics',
        version: '1.0.0',
        status: 'running',
        environment: 'production',
        endpoints: {
          health: '/api/ping',
          login: 'POST /api/auth/login',
          me: 'GET /api/auth/me',
          testClients: 'GET /api/test/clients',
          // Metrics endpoints
          startQuery: 'POST /api/metrics/query/start',
          completeQuery: 'POST /api/metrics/query/complete',
          dailyReport: 'GET /api/metrics/reports/daily',
          platformComparison: 'GET /api/metrics/platforms/comparison',
          systemHealth: 'GET /api/metrics/system/health',
          exportData: 'GET /api/metrics/export',
        },
        testUsers: [
          { email: 'admin@example.com', password: 'password123', role: 'admin' },
          { email: 'user@example.com', password: 'password123', role: 'user' },
        ],
        timestamp: new Date().toISOString(),
      });

    case '/api/ping':
      return res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        authentication: 'ready',
        metrics: 'ready',
        environment: process.env.NODE_ENV || 'production',
      });

    case '/api/test/clients':
      try {
        const clients = await mockDatabase.getAllClients();
        return res.json({
          success: true,
          data: { clients, count: clients.length },
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: { code: 'DATABASE_ERROR', message: error.message },
        });
      }

    case '/api/auth/me':
      const auth = authenticateToken(req);
      if (!auth.success) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: auth.error }
        });
      }
      return res.json({
        success: true,
        data: { user: auth.user },
      });

    case '/api/metrics/system/health':
      const healthAuth = authenticateToken(req);
      if (!healthAuth.success) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: healthAuth.error }
        });
      }
      
      try {
        const health = metricsService.getSystemHealthMetrics();
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

    case '/api/metrics/reports/daily':
      const dailyAuth = authenticateToken(req);
      if (!dailyAuth.success) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: dailyAuth.error }
        });
      }

      try {
        const dateStr = req.query.date as string;
        const date = dateStr ? new Date(dateStr) : new Date();
        const report = await metricsService.generateDailyReport(date);
        
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

    case '/api/metrics/platforms/comparison':
      const comparisonAuth = authenticateToken(req);
      if (!comparisonAuth.success) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: comparisonAuth.error }
        });
      }

      try {
        const { startDate, endDate } = req.query;
        const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate as string) : new Date();
        
        const comparison = await metricsService.getPlatformComparison(start, end);
        
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

    case '/api/metrics/export':
      const exportAuth = authenticateToken(req);
      if (!exportAuth.success) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: exportAuth.error }
        });
      }

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

        const data = await metricsService.exportMetrics(start, end, exportFormat);
        
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

    default:
      // Check if it's a client metrics request
      if (path.startsWith('/api/metrics/clients/')) {
        const clientIdStr = path.split('/')[4];
        const clientId = parseInt(clientIdStr);
        
        if (isNaN(clientId)) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CLIENT_ID', message: 'Invalid client ID' }
          });
        }

        const clientAuth = authenticateToken(req);
        if (!clientAuth.success) {
          return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: clientAuth.error }
          });
        }

        try {
          const { startDate, endDate } = req.query;
          
          if (!startDate || !endDate) {
            return res.status(400).json({
              success: false,
              error: { code: 'MISSING_DATES', message: 'Start and end dates required' }
            });
          }

          const start = new Date(startDate as string);
          const end = new Date(endDate as string);
          const metrics = await metricsService.getClientMetrics(clientId, start, end);
          
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
      }

      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint not found' }
      });
  }
}

async function handlePostRequest(req: VercelRequest, res: VercelResponse, path: string) {
  switch (path) {
    case '/api/auth/login':
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
          { expiresIn: '24h' }
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

    case '/api/metrics/query/start':
      const startAuth = authenticateToken(req);
      if (!startAuth.success) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: startAuth.error }
        });
      }

      try {
        const { queryId, platform, clientId, searchQuery, brandKeywords, expectedMentions } = req.body;

        if (!queryId || !platform || !clientId || !searchQuery || !brandKeywords) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_PARAMETERS', message: 'Required parameters missing' }
          });
        }

        metricsService.startQueryTracking(
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

    case '/api/metrics/query/complete':
      const completeAuth = authenticateToken(req);
      if (!completeAuth.success) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: completeAuth.error }
        });
      }

      try {
        const { queryId, success, response, errorCode, errorMessage, tokensUsed, apiLatency } = req.body;

        if (!queryId || success === undefined) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_PARAMETERS', message: 'QueryId and success status required' }
          });
        }

        const result = await metricsService.completeQueryTracking(queryId, {
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

    default:
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint not found' }
      });
  }
}