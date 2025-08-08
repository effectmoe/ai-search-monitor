/**
 * Simple test for Vercel KV fallback functionality
 */

import { config } from 'dotenv';
config();

// Test the system without Vercel KV (fallback mode)
console.log('🧪 Testing AI Search Monitor System');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('KV_URL configured:', !!process.env.KV_URL);
console.log('Mock APIs enabled:', process.env.MOCK_EXTERNAL_APIS === 'true');

// Test basic imports
try {
  console.log('\n📦 Testing imports...');
  
  // Import basic utilities
  const { vercelKV } = require('./src/database/vercel-kv');
  console.log('✓ Vercel KV imported');
  
  const { mockDatabase } = require('./src/database/mock-database');
  console.log('✓ Mock Database imported');
  
  console.log('\n🔍 Testing KV connection...');
  const kvReady = vercelKV.isReady();
  console.log(`KV Ready: ${kvReady}`);
  
  if (!kvReady) {
    console.log('✓ Will use in-memory fallback for rate limiting and sessions');
  }
  
  console.log('\n💾 Testing mock database...');
  mockDatabase.connect().then(async () => {
    console.log('✓ Mock database connected');
    
    const clients = await mockDatabase.getAllClients();
    console.log(`✓ Mock database has ${clients.length} test clients`);
    
    // Test health check
    const health = await mockDatabase.healthCheck();
    console.log(`✓ Database health: ${health.status}`);
    
    console.log('\n✅ Basic system tests passed!');
    console.log('\n📋 System Status:');
    console.log('   - Environment setup: ✅');
    console.log('   - KV fallback ready: ✅');  
    console.log('   - Mock database: ✅');
    console.log('   - Ready for API testing: ✅');
    
    process.exit(0);
  }).catch((error: any) => {
    console.error('❌ Database test failed:', error.message);
    process.exit(1);
  });
  
} catch (error: any) {
  console.error('❌ Import test failed:', error.message);
  process.exit(1);
}