import { logger } from './logger';

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private requests: number[] = [];
  
  constructor(private readonly options: RateLimiterOptions) {}
  
  async tryAcquire(): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => time > windowStart);
    
    if (this.requests.length < this.options.maxRequests) {
      this.requests.push(now);
      return true;
    }
    
    logger.warn(`Rate limit exceeded: ${this.requests.length}/${this.options.maxRequests} requests in window`);
    return false;
  }
  
  getResetTime(): number {
    if (this.requests.length === 0) return 0;
    
    const oldestRequest = Math.min(...this.requests);
    const resetTime = oldestRequest + this.options.windowMs - Date.now();
    return Math.max(0, resetTime);
  }
  
  getRemainingRequests(): number {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    const validRequests = this.requests.filter(time => time > windowStart);
    return Math.max(0, this.options.maxRequests - validRequests.length);
  }
  
  reset(): void {
    this.requests = [];
  }
  
  getStats() {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    const validRequests = this.requests.filter(time => time > windowStart);
    
    return {
      currentRequests: validRequests.length,
      maxRequests: this.options.maxRequests,
      remainingRequests: this.getRemainingRequests(),
      resetTimeMs: this.getResetTime(),
      windowMs: this.options.windowMs,
    };
  }
}