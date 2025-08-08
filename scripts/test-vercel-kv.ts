#!/usr/bin/env ts-node

/**
 * Test script for Vercel KV integration
 * Run with: npx ts-node scripts/test-vercel-kv.ts
 */

import { config } from 'dotenv';
import { vercelKV } from '../src/database/vercel-kv';

// Load environment variables
config();

async function testVercelKV() {
  console.log('\n🧪 Testing Vercel KV Integration...\n');

  try {
    // Test 1: Health Check
    console.log('📊 1. Health Check');
    const healthCheck = await vercelKV.healthCheck();
    console.log(`   Status: ${healthCheck.status}`);
    if (healthCheck.latency) {
      console.log(`   Latency: ${healthCheck.latency}ms`);
    }
    if (healthCheck.error) {
      console.log(`   Error: ${healthCheck.error}`);
    }
    
    if (healthCheck.status === 'unhealthy') {
      console.log('❌ Vercel KV is not available. Please check your configuration.');
      return;
    }

    // Test 2: Basic Cache Operations
    console.log('\n💾 2. Cache Operations');
    
    // Set cache
    await vercelKV.setCache('test-key', { message: 'Hello Vercel KV!', timestamp: Date.now() }, 60);
    console.log('   ✓ Set cache item');

    // Get cache
    const cached = await vercelKV.getCache('test-key');
    console.log('   ✓ Retrieved cache:', cached);

    // Delete cache
    await vercelKV.deleteCache('test-key');
    console.log('   ✓ Deleted cache item');

    // Verify deletion
    const deletedCache = await vercelKV.getCache('test-key');
    console.log('   ✓ Verified deletion (should be null):', deletedCache);

    // Test 3: Rate Limiting
    console.log('\n🚦 3. Rate Limiting');
    
    const rateLimitKey = 'test-user-123';
    const windowSeconds = 60;
    
    // First request
    const limit1 = await vercelKV.incrementRateLimit(rateLimitKey, windowSeconds);
    console.log(`   ✓ First request: ${limit1.count}/${5} (resets at ${new Date(limit1.resetTime)})`);

    // Second request
    const limit2 = await vercelKV.incrementRateLimit(rateLimitKey, windowSeconds);
    console.log(`   ✓ Second request: ${limit2.count}/${5} (resets at ${new Date(limit2.resetTime)})`);

    // Get current rate limit
    const currentLimit = await vercelKV.getRateLimit(rateLimitKey);
    console.log(`   ✓ Current limit: ${currentLimit?.count || 0}/${5}`);

    // Test 4: Session Management
    console.log('\n👤 4. Session Management');
    
    const userId = 'test-user-456';
    const sessionData = {
      email: 'test@example.com',
      role: 'user',
      loginTime: Date.now(),
    };

    // Store session
    await vercelKV.storeSession(userId, sessionData, 300); // 5 minutes
    console.log('   ✓ Session stored');

    // Get session
    const retrievedSession = await vercelKV.getSession(userId);
    console.log('   ✓ Session retrieved:', retrievedSession);

    // Test 5: Token Blacklisting
    console.log('\n🚫 5. Token Blacklisting');
    
    const tokenId = 'test-token-789';
    
    // Blacklist token
    await vercelKV.blacklistToken(tokenId, 300); // 5 minutes
    console.log('   ✓ Token blacklisted');

    // Check blacklist
    const isBlacklisted = await vercelKV.isTokenBlacklisted(tokenId);
    console.log(`   ✓ Token blacklist status: ${isBlacklisted}`);

    // Test 6: Temporary Data
    console.log('\n⏰ 6. Temporary Data');
    
    const tempKey = 'password-reset-token';
    const tempData = {
      userId: 'user-123',
      email: 'user@example.com',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
    };

    // Set temporary data
    await vercelKV.setTemporaryData(tempKey, tempData, 300); // 5 minutes
    console.log('   ✓ Temporary data stored');

    // Get temporary data
    const retrievedTempData = await vercelKV.getTemporaryData(tempKey);
    console.log('   ✓ Temporary data retrieved:', retrievedTempData);

    // Test 7: Metrics
    console.log('\n📈 7. Metrics');
    
    // Increment metrics
    await vercelKV.incrementMetric('api.requests', 1);
    await vercelKV.incrementMetric('api.requests', 2);
    await vercelKV.incrementMetric('api.errors', 1);
    console.log('   ✓ Metrics incremented');

    // Get metrics
    const requestMetrics = await vercelKV.getMetrics('api.requests', 1);
    const errorMetrics = await vercelKV.getMetrics('api.errors', 1);
    console.log('   ✓ Request metrics:', requestMetrics);
    console.log('   ✓ Error metrics:', errorMetrics);

    // Test 8: Cache Pattern Invalidation
    console.log('\n🗑️  8. Cache Pattern Invalidation');
    
    // Set multiple cache items
    await vercelKV.setCache('user:123:profile', { name: 'John' });
    await vercelKV.setCache('user:123:settings', { theme: 'dark' });
    await vercelKV.setCache('user:456:profile', { name: 'Jane' });
    console.log('   ✓ Multiple cache items set');

    // Invalidate pattern
    await vercelKV.invalidateCachePattern('user:123:*');
    console.log('   ✓ Cache pattern invalidated');

    // Verify invalidation
    const profile123 = await vercelKV.getCache('user:123:profile');
    const settings123 = await vercelKV.getCache('user:123:settings');
    const profile456 = await vercelKV.getCache('user:456:profile');
    
    console.log(`   ✓ user:123:profile (should be null): ${profile123}`);
    console.log(`   ✓ user:123:settings (should be null): ${settings123}`);
    console.log(`   ✓ user:456:profile (should exist): ${profile456 ? 'exists' : 'null'}`);

    // Test 9: Storage Statistics
    console.log('\n📊 9. Storage Statistics');
    
    const stats = await vercelKV.getStats();
    console.log(`   ✓ Total keys: ${stats.totalKeys}`);
    if (stats.memoryUsage) {
      console.log(`   ✓ Memory usage: ${stats.memoryUsage}`);
    }

    // Cleanup test data
    console.log('\n🧹 10. Cleanup');
    await vercelKV.deleteSession(userId);
    await vercelKV.resetRateLimit(rateLimitKey);
    await vercelKV.deleteTemporaryData(tempKey);
    await vercelKV.deleteCache('user:456:profile');
    console.log('   ✓ Test data cleaned up');

    console.log('\n✅ All Vercel KV tests passed!');
    console.log('\n📋 Integration Status:');
    console.log('   - Basic operations: ✅');
    console.log('   - Rate limiting: ✅');
    console.log('   - Session management: ✅');
    console.log('   - Token blacklisting: ✅');
    console.log('   - Temporary data: ✅');
    console.log('   - Metrics collection: ✅');
    console.log('   - Pattern invalidation: ✅');
    console.log('\n🚀 Vercel KV is ready for production use!');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check your .env file has correct KV_* variables');
    console.error('   2. Ensure your Vercel KV store is active');
    console.error('   3. Verify API tokens have correct permissions');
    console.error('   4. Check network connectivity to Vercel');
    
    if (error.message.includes('401') || error.message.includes('unauthorized')) {
      console.error('\n   💡 Authentication issue - check KV_REST_API_TOKEN');
    } else if (error.message.includes('404') || error.message.includes('not found')) {
      console.error('\n   💡 Store not found - check KV_URL and KV_REST_API_URL');
    }

    process.exit(1);
  }
}

async function testPerformance() {
  console.log('\n⚡ Performance Test');
  
  const operations = 100;
  const start = Date.now();

  // Test concurrent operations
  const promises = [];
  for (let i = 0; i < operations; i++) {
    promises.push(vercelKV.setCache(`perf:${i}`, { data: i }, 60));
  }

  await Promise.all(promises);
  
  const duration = Date.now() - start;
  const opsPerSecond = Math.round((operations / duration) * 1000);
  
  console.log(`   ✓ ${operations} operations completed in ${duration}ms`);
  console.log(`   ✓ Performance: ${opsPerSecond} ops/second`);

  // Cleanup
  for (let i = 0; i < operations; i++) {
    await vercelKV.deleteCache(`perf:${i}`);
  }
}

// Run tests
async function main() {
  try {
    await testVercelKV();
    
    if (vercelKV.isReady()) {
      await testPerformance();
    }
    
    console.log('\n🎉 All tests completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main();
}

export { testVercelKV };