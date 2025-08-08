// Database module exports
export { DatabaseConnection, db } from './connection';
export { dbInitializer } from './initializer';

// Repository exports
export { BaseRepository } from './repositories/base.repository';
export { ClientRepository, clientRepository, type Client } from './repositories/client.repository';
export { 
  ScrapingResultRepository, 
  scrapingResultRepository,
  type ScrapingResult,
  type BrandMention,
  type CompetitorMention,
  type SentimentAnalysis,
  type VisibilityScore
} from './repositories/scraping-result.repository';
export { 
  MonitoringSessionRepository,
  type MonitoringSession
} from './repositories/monitoring-session.repository';
export {
  DailyMetricsRepository,
  dailyMetricsRepository,
  type DailyMetrics
} from './repositories/daily-metrics.repository';

// Helper function to initialize all repositories
export async function initializeDatabase(): Promise<void> {
  const { dbInitializer } = await import('./initializer');
  await dbInitializer.initialize();
}

// Helper function to get all repositories
export function getRepositories() {
  return {
    clients: clientRepository,
    scrapingResults: scrapingResultRepository,
    dailyMetrics: dailyMetricsRepository,
  };
}