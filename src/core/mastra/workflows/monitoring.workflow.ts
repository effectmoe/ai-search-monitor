import { createWorkflow } from '@mastra/core';
import { z } from 'zod';
import { logger } from '../../../utils/logger';
import { CircuitBreaker } from '../../../utils/circuit-breaker';
import { RateLimiter } from '../../../utils/rate-limiter';
import { retry, isRetryableError } from '../../../utils/retry';

// Input schema for validation
const MonitoringInputSchema = z.object({
  clientIds: z.array(z.number()).optional(),
  platforms: z.array(z.enum(['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai'])).optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  retryOnFailure: z.boolean().default(true),
  maxRetries: z.number().min(0).max(5).default(3),
  timeout: z.number().min(1000).max(300000).default(30000),
});

// Circuit breakers for each platform-client combination
const circuitBreakers = new Map<string, CircuitBreaker>();

// Rate limiters for each platform
const rateLimiters = {
  chatgpt: new RateLimiter({ 
    maxRequests: parseInt(process.env.CHATGPT_RATE_LIMIT || '10'), 
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') 
  }),
  perplexity: new RateLimiter({ 
    maxRequests: parseInt(process.env.PERPLEXITY_RATE_LIMIT || '20'), 
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') 
  }),
  gemini: new RateLimiter({ 
    maxRequests: parseInt(process.env.GEMINI_RATE_LIMIT || '15'), 
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') 
  }),
  claude: new RateLimiter({ 
    maxRequests: parseInt(process.env.CLAUDE_RATE_LIMIT || '10'), 
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') 
  }),
  'google-ai': new RateLimiter({ 
    maxRequests: parseInt(process.env.GOOGLE_AI_RATE_LIMIT || '25'), 
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') 
  }),
};

type MonitoringInput = z.infer<typeof MonitoringInputSchema>;
type Platform = 'chatgpt' | 'perplexity' | 'gemini' | 'claude' | 'google-ai';

export const monitoringWorkflow = createWorkflow({
  name: 'ai-search-monitoring',
  description: 'Main workflow for monitoring AI platforms',
  version: '1.0.0',
  
  execute: async ({ input, tools, agents }) => {
    const startTime = Date.now();
    const errors: any[] = [];
    const results: any[] = [];
    
    try {
      // Validate input
      const validatedInput = MonitoringInputSchema.parse(input);
      logger.info('Starting monitoring workflow', { input: validatedInput });
      
      // Get clients to monitor
      const clients = await getClients(validatedInput.clientIds);
      if (!clients || clients.length === 0) {
        throw new Error('No clients found for monitoring');
      }
      
      // Get platforms to monitor
      const platforms: Platform[] = validatedInput.platforms || 
        ['chatgpt', 'perplexity', 'gemini', 'claude', 'google-ai'];
      
      // Determine concurrency based on priority
      const concurrency = validatedInput.priority === 'high' ? 5 : 
                         validatedInput.priority === 'medium' ? 3 : 1;
      
      // Process clients in batches
      const clientBatches = chunkArray(clients, concurrency);
      
      for (const batch of clientBatches) {
        const batchPromises = batch.map(async (client) => {
          const clientResults = [];
          
          for (const platform of platforms) {
            // Check circuit breaker
            const breakerKey = `${client.id}-${platform}`;
            if (!circuitBreakers.has(breakerKey)) {
              circuitBreakers.set(breakerKey, new CircuitBreaker({
                failureThreshold: 5,
                resetTimeout: 60000,
                halfOpenRequests: 2,
              }));
            }
            
            const breaker = circuitBreakers.get(breakerKey)!;
            
            if (breaker.isOpen()) {
              logger.warn(`Circuit breaker open for ${breakerKey}`);
              errors.push({
                clientId: client.id,
                platform,
                error: 'Circuit breaker open',
                timestamp: new Date(),
              });
              continue;
            }
            
            // Check rate limit
            const rateLimiter = rateLimiters[platform];
            if (!await rateLimiter.tryAcquire()) {
              logger.warn(`Rate limit exceeded for ${platform}`);
              errors.push({
                clientId: client.id,
                platform,
                error: 'Rate limit exceeded',
                resetTime: rateLimiter.getResetTime(),
                timestamp: new Date(),
              });
              continue;
            }
            
            // Execute scraping with retry logic
            try {
              const result = await retry(
                async () => {
                  // Call the scraper agent
                  const scraperAgent = agents.get('scraper');
                  if (!scraperAgent) {
                    throw new Error('Scraper agent not found');
                  }
                  
                  return await scraperAgent.execute({
                    platform,
                    client,
                    timeout: validatedInput.timeout,
                  });
                },
                {
                  attempts: validatedInput.maxRetries,
                  delay: 2000,
                  backoff: 'exponential',
                  maxDelay: 30000,
                  retryCondition: isRetryableError,
                  onRetry: (error, attempt) => {
                    logger.warn(`Retrying scraping for ${platform}`, {
                      clientId: client.id,
                      attempt,
                      error: error.message,
                    });
                  },
                }
              );
              
              // Record success
              breaker.recordSuccess();
              
              // Analyze the result
              const analyzerAgent = agents.get('analyzer');
              if (analyzerAgent) {
                const analysis = await analyzerAgent.execute({
                  result,
                  client,
                  platform,
                });
                
                clientResults.push({
                  platform,
                  success: true,
                  data: analysis,
                  raw: result,
                });
              } else {
                clientResults.push({
                  platform,
                  success: true,
                  data: result,
                });
              }
              
            } catch (error: any) {
              breaker.recordFailure();
              
              logger.error(`Scraping failed for ${platform}`, {
                clientId: client.id,
                error: error.message,
                stack: error.stack,
              });
              
              errors.push({
                clientId: client.id,
                platform,
                error: error.message,
                timestamp: new Date(),
              });
              
              clientResults.push({
                platform,
                success: false,
                error: error.message,
              });
            }
          }
          
          return {
            clientId: client.id,
            clientName: client.name,
            results: clientResults,
            timestamp: new Date(),
          };
        });
        
        // Collect batch results
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            errors.push({
              error: result.reason.message,
              timestamp: new Date(),
            });
          }
        });
      }
      
      const executionTime = Date.now() - startTime;
      
      // Log execution stats
      logger.info('Monitoring workflow completed', {
        executionTime,
        totalClients: clients.length,
        totalPlatforms: platforms.length,
        successfulResults: results.length,
        errors: errors.length,
      });
      
      return {
        success: true,
        results,
        errors,
        stats: {
          executionTime,
          totalClients: clients.length,
          totalPlatforms: platforms.length,
          successfulResults: results.length,
          failedResults: errors.length,
        },
      };
      
    } catch (error: any) {
      logger.error('Workflow execution failed', {
        error: error.message,
        stack: error.stack,
        input,
      });
      
      throw error;
    }
  },
});

// Helper function to chunk array
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Get clients from database
async function getClients(clientIds?: number[]): Promise<any[]> {
  const { clientRepository } = await import('../../../database');
  
  if (clientIds && clientIds.length > 0) {
    return await clientRepository.getClientsForMonitoring(clientIds);
  }
  
  return await clientRepository.findActive();
}