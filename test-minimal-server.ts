/**
 * Minimal test server to debug the hanging issue
 */
import express from 'express';

const app = express();
const port = parseInt(process.env.API_PORT || '3002');

// Basic middleware
app.use(express.json());

// Simple ping route
app.get('/ping', (_req, res) => {
  console.log('Ping endpoint hit');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: port,
    message: 'Minimal test server is running'
  });
});

// Start server
const server = app.listen(port, () => {
  console.log(`✅ Minimal test server started on port ${port}`);
  console.log(`   URL: http://localhost:${port}/ping`);
});

// Handle server errors
server.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error.message);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});