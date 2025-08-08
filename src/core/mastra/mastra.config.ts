import { Mastra } from '@mastra/core';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config();

// Initialize Mastra configuration
export const mastraConfig = {
  name: 'ai-search-monitor',
  version: '1.0.0',
  workflows: {
    path: path.join(__dirname, 'workflows'),
  },
  agents: {
    path: path.join(__dirname, 'agents'),
  },
  tools: {
    path: path.join(__dirname, 'tools'),
  },
  storage: {
    type: 'sqlite' as const,
    path: process.env.DATABASE_PATH || './data/monitoring.db',
  },
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
  metrics: {
    enabled: process.env.ENABLE_METRICS === 'true',
  },
};

// Create and export Mastra instance
export const mastra = new Mastra(mastraConfig);

// Initialize Mastra
export async function initializeMastra(): Promise<void> {
  try {
    await mastra.init();
    console.log('✅ Mastra initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Mastra:', error);
    throw error;
  }
}