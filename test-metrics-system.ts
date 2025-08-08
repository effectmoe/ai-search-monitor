/**
 * Test script for the metrics evaluation system
 * Tests Phase 1 implementation of base metrics
 */
import { BaseMetricsCollector, BaseMetricsResult } from './src/evaluation/metrics/BaseMetrics';
import { MetricsService } from './src/evaluation/MetricsService';
import { mockDatabase } from './src/database/mock-database';

async function testMetricsSystem(): Promise<void> {
  console.log('🧪 Testing AI Search Monitor Metrics System');
  console.log('===========================================\n');

  // Initialize metrics service
  const metricsService = new MetricsService({
    database: mockDatabase,
    enableRealTimeAnalysis: true,
    metricsRetentionDays: 30,
    costPerToken: 0.001, // 0.001 yen per token
  });

  console.log('✅ Metrics service initialized\n');

  // Test 1: Basic metrics collection
  console.log('Test 1: Basic Metrics Collection');
  console.log('--------------------------------');

  const collector = new BaseMetricsCollector();

  // Sample test data
  const testQueries = [
    {
      query: 'EFFECT company AI solutions',
      result: 'EFFECT is a leading company providing innovative AI solutions for businesses...',
      platform: 'chatgpt',
      brandKeywords: ['EFFECT', 'AI solutions'],
    },
    {
      query: 'tonychustudio web development',
      result: 'tonychustudio offers professional web development services...',
      platform: 'claude',
      brandKeywords: ['tonychustudio', 'web development'],
    },
    {
      query: 'unknown brand search',
      result: 'Sorry, I don\'t have information about that brand',
      platform: 'gemini',
      brandKeywords: ['unknown'],
    }
  ];

  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];
    const queryId = `test-query-${i + 1}`;
    
    // Calculate metrics
    const relevanceScore = collector.calculateRelevanceScore(test.query, test.result);
    const accuracyScore = collector.calculateAccuracyScore(test.result, test.brandKeywords[0]);
    const completenessScore = collector.calculateCompletenessScore(test.result);
    const brandMentions = collector.countBrandMentions(test.result, test.brandKeywords);
    
    // Create metrics result
    const metricsResult: BaseMetricsResult = {
      timestamp: new Date().toISOString(),
      queryId,
      platform: test.platform,
      clientId: i + 1,
      responseTime: Math.random() * 5000 + 1000, // 1-6 seconds
      apiLatency: Math.random() * 1000 + 200, // 200ms-1.2s
      processingTime: Math.random() * 500 + 100, // 100-600ms
      relevanceScore,
      accuracyScore,
      completenessScore,
      responseLength: test.result.length,
      keywordMatches: test.query.split(' ').length,
      brandMentions,
      tokensUsed: Math.floor(test.result.length / 4), // Rough estimate
      costEstimate: (test.result.length / 4) * 0.001,
      success: !test.result.includes('Sorry'),
      searchQuery: test.query,
      actualResult: test.result,
    };
    
    collector.recordMetric(metricsResult);
    
    console.log(`Query ${i + 1}: ${test.query}`);
    console.log(`  Platform: ${test.platform}`);
    console.log(`  Relevance: ${relevanceScore.toFixed(2)}`);
    console.log(`  Accuracy: ${accuracyScore.toFixed(2)}`);
    console.log(`  Completeness: ${completenessScore.toFixed(2)}`);
    console.log(`  Brand Mentions: ${brandMentions}`);
    console.log(`  Success: ${metricsResult.success}`);
    console.log('');
  }

  // Test 2: Aggregated metrics
  console.log('Test 2: Aggregated Metrics Report');
  console.log('---------------------------------');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const today = new Date();

  const aggregatedReport = collector.generateAggregatedReport(yesterday, today, 'day');
  
  console.log(`Period: ${aggregatedReport.startDate.split('T')[0]} to ${aggregatedReport.endDate.split('T')[0]}`);
  console.log(`Total Queries: ${aggregatedReport.totalQueries}`);
  console.log(`Successful: ${aggregatedReport.successfulQueries}`);
  console.log(`Failed: ${aggregatedReport.failedQueries}`);
  console.log(`Success Rate: ${(aggregatedReport.successRate * 100).toFixed(1)}%`);
  console.log(`Average Response Time: ${aggregatedReport.avgResponseTime.toFixed(0)}ms`);
  console.log(`Average Relevance Score: ${aggregatedReport.avgRelevanceScore.toFixed(2)}`);
  console.log(`Average Accuracy Score: ${aggregatedReport.avgAccuracyScore.toFixed(2)}`);
  console.log(`Total Cost: ¥${aggregatedReport.totalCost.toFixed(2)}`);
  console.log('');
  
  console.log('Platform Breakdown:');
  for (const [platform, metrics] of Object.entries(aggregatedReport.platformMetrics)) {
    console.log(`  ${platform}: ${metrics.queries} queries, avg score: ${metrics.avgScore.toFixed(2)}, avg cost: ¥${metrics.avgCost.toFixed(2)}`);
  }
  console.log('');

  // Test 3: MetricsService integration
  console.log('Test 3: MetricsService Integration');
  console.log('----------------------------------');

  // Simulate query tracking
  const serviceQueryId = 'service-test-001';
  metricsService.startQueryTracking(
    serviceQueryId,
    'perplexity',
    1,
    'tonychustudio business services',
    ['tonychustudio', 'business'],
    ['web development', 'consulting']
  );

  console.log(`Started tracking query: ${serviceQueryId}`);
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Complete tracking
  const result = await metricsService.completeQueryTracking(serviceQueryId, {
    success: true,
    response: 'tonychustudio provides comprehensive business services including web development, consulting, and digital solutions...',
    tokensUsed: 45,
    apiLatency: 800,
  });

  if (result) {
    console.log('Query tracking completed:');
    console.log(`  Response Time: ${result.responseTime}ms`);
    console.log(`  Relevance: ${result.relevanceScore.toFixed(2)}`);
    console.log(`  Accuracy: ${result.accuracyScore.toFixed(2)}`);
    console.log(`  Cost: ¥${(result.costEstimate || 0).toFixed(3)}`);
  }
  console.log('');

  // Test 4: System health metrics
  console.log('Test 4: System Health Metrics');
  console.log('-----------------------------');

  const healthMetrics = metricsService.getSystemHealthMetrics();
  console.log(`Active Queries: ${healthMetrics.activeQueries}`);
  console.log(`24h Average Response Time: ${healthMetrics.averageResponseTime24h.toFixed(0)}ms`);
  console.log(`24h Error Rate: ${(healthMetrics.errorRate24h * 100).toFixed(1)}%`);
  console.log(`System Load: ${healthMetrics.systemLoad}`);
  console.log('');

  // Test 5: CSV Export
  console.log('Test 5: Data Export');
  console.log('------------------');

  const csvData = collector.exportToCSV();
  const csvLines = csvData.split('\n');
  console.log(`CSV Export: ${csvLines.length - 1} data rows`);
  console.log('Sample CSV header:');
  console.log(csvLines[0]);
  if (csvLines.length > 1) {
    console.log('Sample CSV data:');
    console.log(csvLines[1].substring(0, 100) + '...');
  }
  console.log('');

  // Test 6: Platform comparison
  console.log('Test 6: Platform Comparison');
  console.log('---------------------------');

  // Add more sample data for comparison
  const platforms = ['chatgpt', 'claude', 'gemini', 'perplexity', 'grok'];
  for (let i = 0; i < 10; i++) {
    const platform = platforms[i % platforms.length];
    const queryId = `comparison-test-${i}`;
    
    metricsService.startQueryTracking(
      queryId,
      platform,
      (i % 3) + 1,
      `Test query ${i} for ${platform}`,
      ['test', 'brand'],
      ['expected', 'result']
    );

    // Simulate different response times and quality for different platforms
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const success = Math.random() > 0.1; // 90% success rate
    const responseTime = Math.random() * 3000 + 500;
    
    await metricsService.completeQueryTracking(queryId, {
      success,
      response: success ? 'Test response with relevant information about the brand' : 'Error: Information not available',
      tokensUsed: Math.floor(Math.random() * 50) + 20,
      apiLatency: responseTime * 0.6,
    });
  }

  const comparison = await metricsService.getPlatformComparison(yesterday, today);
  console.log('Platform Performance Comparison:');
  for (const [platform, metrics] of Object.entries(comparison)) {
    console.log(`${platform}:`);
    console.log(`  Queries: ${metrics.totalQueries}`);
    console.log(`  Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`  Avg Response Time: ${metrics.avgResponseTime.toFixed(0)}ms`);
    console.log(`  Avg Relevance: ${metrics.avgRelevanceScore.toFixed(2)}`);
    console.log(`  Avg Cost: ¥${metrics.avgCost.toFixed(3)}`);
    console.log('');
  }

  console.log('🎉 Metrics System Testing Completed!');
  console.log('=====================================');
  console.log('');
  console.log('✅ Phase 1 Base Metrics Implementation:');
  console.log('   - Response time tracking');
  console.log('   - Quality scoring (relevance, accuracy, completeness)');
  console.log('   - Cost estimation');
  console.log('   - Platform performance comparison');
  console.log('   - Real-time monitoring');
  console.log('   - Data export (CSV/JSON)');
  console.log('');
  console.log('📊 Next Steps:');
  console.log('   - Phase 2: RAGAS integration for advanced evaluation');
  console.log('   - Phase 3: Continuous improvement automation');
  console.log('   - Database persistence for long-term analysis');
  console.log('   - Dashboard visualization');
}

// Run the test
if (require.main === module) {
  testMetricsSystem().catch((error) => {
    console.error('❌ Metrics system test failed:', error);
    process.exit(1);
  });
}

export { testMetricsSystem };