/**
 * Base deep-link extraction strategy. Subclasses implement `extract(page, url)`.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';

export interface DeepLinkResult {
  success: boolean;
  jobs: Partial<ExtractedJob>[];
  fallback: boolean;
  error: string | null;
  deepExtractedUrl: string | null;
}

export abstract class BaseStrategy {
  abstract readonly domain: string;

  /**
   * Extract job data from the deep-linked page.
   * Implementations should be defensive: any selector miss should return
   * partial data, not throw.
   */
  abstract extract(page: Page, url: string): Promise<Partial<ExtractedJob>[]>;

  /**
   * Helper: wait for any of the given selectors, return the first that matches.
   */
  protected async waitForAny(page: Page, selectors: string[], timeout = 10000): Promise<string | null> {
    return Promise.race([
      ...selectors.map((s) =>
        page.waitForSelector(s, { timeout }).then(() => s).catch(() => null),
      ),
      new Promise<string | null>((resolve) => setTimeout(() => resolve(null), timeout)),
    ]);
  }

  /**
   * Helper: detect anti-bot blocking (Cloudflare interstitial, CAPTCHA, etc.).
   */
  protected async detectBlocking(page: Page): Promise<boolean> {
    const indicators = [
      'Just a moment', // Cloudflare
      'Checking your browser',
      'cf-challenge-running',
      'captcha',
      'Access denied',
      'Puppeteer detected',
      '请开启 JavaScript', // some Chinese bot walls
    ];
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) ?? '');
    return indicators.some((i) => bodyText.toLowerCase().includes(i.toLowerCase()));
  }
}
