import { logger } from './logger';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests?: number;
}

export class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number | null = null;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private halfOpenAttempts: number = 0;
  
  constructor(private readonly options: CircuitBreakerOptions) {}
  
  isOpen(): boolean {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (this.lastFailureTime && now - this.lastFailureTime > this.options.resetTimeout) {
        logger.info('Circuit breaker transitioning to HALF_OPEN');
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        return false;
      }
      return true;
    }
    return false;
  }
  
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      const requiredSuccesses = this.options.halfOpenRequests || 1;
      
      if (this.halfOpenAttempts >= requiredSuccesses) {
        logger.info('Circuit breaker transitioning to CLOSED');
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }
  
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      logger.warn('Circuit breaker failure in HALF_OPEN state, transitioning to OPEN');
      this.state = 'OPEN';
      this.halfOpenAttempts = 0;
    } else if (this.failureCount >= this.options.failureThreshold) {
      logger.error(`Circuit breaker threshold reached (${this.failureCount}), transitioning to OPEN`);
      this.state = 'OPEN';
    }
  }
  
  getState(): string {
    return this.state;
  }
  
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttempts,
    };
  }
}