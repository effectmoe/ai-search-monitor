import { logger } from './logger';

export interface RetryOptions {
  attempts: number;
  delay: number;
  backoff?: 'linear' | 'exponential';
  maxDelay?: number;
  onRetry?: (error: Error, attempt: number) => void;
  retryCondition?: (error: Error) => boolean;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if we should retry this error
      if (options.retryCondition && !options.retryCondition(lastError)) {
        throw lastError;
      }
      
      if (attempt === options.attempts) {
        logger.error(`All retry attempts failed after ${attempt} attempts`, {
          error: lastError.message,
          stack: lastError.stack,
        });
        throw lastError;
      }
      
      if (options.onRetry) {
        options.onRetry(lastError, attempt);
      }
      
      let delay = options.delay;
      
      if (options.backoff === 'exponential') {
        delay = Math.min(
          options.delay * Math.pow(2, attempt - 1),
          options.maxDelay || 60000
        );
      } else if (options.backoff === 'linear') {
        delay = Math.min(
          options.delay * attempt,
          options.maxDelay || 60000
        );
      }
      
      logger.info(`Retry attempt ${attempt}/${options.attempts} after ${delay}ms delay`, {
        error: lastError.message,
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Helper function to determine if an error is retryable
export function isRetryableError(error: Error): boolean {
  const retryableErrors = [
    'TIMEOUT',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'NETWORK_ERROR',
    'RATE_LIMIT',
    'TEMPORARY_FAILURE',
    '429', // Too Many Requests
    '503', // Service Unavailable
    '504', // Gateway Timeout
  ];
  
  const errorMessage = error.message || '';
  const errorCode = (error as any).code || '';
  
  return retryableErrors.some(type => 
    errorMessage.includes(type) || 
    errorCode.includes(type) ||
    errorCode === type
  );
}