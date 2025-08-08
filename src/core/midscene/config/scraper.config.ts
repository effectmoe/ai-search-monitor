import { z } from 'zod';

export const ScraperConfigSchema = z.object({
  headless: z.boolean().default(true),
  timeout: z.number().min(1000).max(300000).default(30000),
  userAgent: z.string().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
  viewport: z.object({
    width: z.number().default(1920),
    height: z.number().default(1080),
  }).default({ width: 1920, height: 1080 }),
  locale: z.string().default('ja-JP'),
  timezoneId: z.string().default('Asia/Tokyo'),
  maxRetries: z.number().min(0).max(5).default(3),
  retryDelay: z.number().min(1000).max(30000).default(2000),
  screenshotQuality: z.number().min(0).max(100).default(85),
  cacheEnabled: z.boolean().default(true),
  cacheTTL: z.number().default(3600000), // 1 hour
});

export type ScraperConfig = z.infer<typeof ScraperConfigSchema>;

export const defaultScraperConfig: ScraperConfig = {
  headless: process.env.HEADLESS_BROWSER === 'true',
  timeout: parseInt(process.env.SCRAPER_TIMEOUT || '30000'),
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 },
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  maxRetries: 3,
  retryDelay: 2000,
  screenshotQuality: 85,
  cacheEnabled: true,
  cacheTTL: 3600000,
};