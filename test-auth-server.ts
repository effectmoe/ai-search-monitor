/**
 * Simple authentication test server
 * Tests basic JWT authentication without complex middleware
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

// Load environment variables
dotenv.config();

const { mockDatabase } = require('./src/database/mock-database');
const { logger } = require('./src/utils/logger');

class AuthTestServer {
  private app: express.Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.API_PORT || '3002');
    this.initializeMiddleware();
    this.initializeRoutes();
  }

  private initializeMiddleware(): void {
    // Basic middleware only
    this.app.use(cors());
    this.app.use(express.json());
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/ping', (_req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        authentication: 'ready',
      });
    });

    // Simple login endpoint
    this.app.post('/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;

        // Simple test users
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

        // Generate JWT token
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

    // Protected route to test authentication
    this.app.get('/auth/me', (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            success: false,
            error: { code: 'NO_TOKEN', message: 'No valid token provided' },
          });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');

        return res.json({
          success: true,
          data: { user: decoded },
        });
      } catch (error: any) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        });
      }
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

    // API info route
    this.app.get('/api', (_req, res) => {
      res.json({
        name: 'AI Search Monitor Auth Test API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/ping',
          login: 'POST /auth/login',
          me: 'GET /auth/me',
          testClients: 'GET /test/clients',
        },
        testUsers: [
          { email: 'admin@example.com', password: 'password123', role: 'admin' },
          { email: 'user@example.com', password: 'password123', role: 'user' },
        ],
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize mock database
      await mockDatabase.connect();
      logger.info('Mock database connected');

      const server = this.app.listen(this.port, () => {
        console.log(`✅ Auth Test Server started on port ${this.port}`);
        console.log(`   Health: http://localhost:${this.port}/ping`);
        console.log(`   API Info: http://localhost:${this.port}/api`);
        console.log(`   Login: POST http://localhost:${this.port}/auth/login`);
        console.log(`   Profile: GET http://localhost:${this.port}/auth/me`);
      });

      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${this.port} is already in use`);
          process.exit(1);
        } else {
          console.error('❌ Server error:', error.message);
        }
      });

      // Graceful shutdown
      process.on('SIGINT', () => {
        console.log('\\n👋 Shutting down server...');
        server.close(() => {
          console.log('✅ Server closed');
          process.exit(0);
        });
      });

    } catch (error: any) {
      console.error('❌ Failed to start server:', error.message);
      process.exit(1);
    }
  }
}

// Start the server
if (require.main === module) {
  const server = new AuthTestServer();
  server.start().catch((error) => {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  });
}

export { AuthTestServer };