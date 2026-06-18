/**
 * DeepLinkNavigator — Puppeteer-based deep-link extractor (doc §6.3, §9).
 *
 * Responsibilities:
 * 1. Pick the right strategy for the URL's domain.
 * 2. Try with stealth plugin; detect blocking.
 * 3. On failure, return `fallback: true` so caller can fall back to
 *    Telegram-message-only data (marked extraction_method: telegram_only).
 */
import puppeteer, { type Browser, type Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { USER_AGENT } from '@tja/shared';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy, type DeepLinkResult } from './strategies/base.js';
import { HarmeeJobsStrategy } from './strategies/harmeejobs.js';
import { EthiojobsStrategy } from './strategies/ethiojobs.js';
import { GeezJobsStrategy } from './strategies/geezjobs.js';
import { ElelanJobsStrategy } from './strategies/elelanjobs.js';
import { KebenaJobsStrategy } from './strategies/kebenajobs.js';
import { EthioJobsHubStrategy } from './strategies/ethiojobshub.js';
import { EffoySiraStrategy } from './strategies/effoysira.js';
import { AfriworkStrategy } from './strategies/afriwork.js';
import { HahuJobsStrategy } from './strategies/hahujobs.js';
import { LinkedInStrategy } from './strategies/linkedin.js';
import { GenericStrategy } from './strategies/generic.js';

puppeteerExtra.use(StealthPlugin());

export class DeepLinkNavigator {
  private browser: Browser | null = null;
  private readonly timeout: number;
  private readonly headless: boolean;
  private readonly strategies: Map<string, BaseStrategy> = new Map();
  private readonly generic = new GenericStrategy();

  constructor(opts: { timeout?: number; headless?: boolean } = {}) {
    this.timeout = opts.timeout ?? parseInt(process.env.PUPPETEER_TIMEOUT ?? '30000', 10);
    this.headless = opts.headless ?? process.env.PUPPETEER_HEADLESS !== 'false';

    for (const StrategyClass of [
      HarmeeJobsStrategy,
      EthiojobsStrategy,
      GeezJobsStrategy,
      ElelanJobsStrategy,
      KebenaJobsStrategy,
      EthioJobsHubStrategy,
      EffoySiraStrategy,
      AfriworkStrategy,
      HahuJobsStrategy,
      LinkedInStrategy,
    ]) {
      const instance = new StrategyClass();
      this.strategies.set(instance.domain, instance);
    }
  }

  async init(): Promise<void> {
    if (this.browser) return;
    this.browser = await puppeteerExtra.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Extract job data from a deep link.
   * Never throws — returns DeepLinkResult with fallback=true on failure.
   */
  async extractFromDeepLink(url: string): Promise<DeepLinkResult> {
    const result: DeepLinkResult = {
      success: false,
      jobs: [],
      fallback: false,
      error: null,
      deepExtractedUrl: url,
    };

    try {
      await this.init();
      const browser = this.browser!;
      const page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);
      await page.setViewport({ width: 1280, height: 800 });

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: this.timeout });

        const strategy = this.getStrategy(url);
        const jobs = await strategy.extract(page, url);

        result.success = jobs.length > 0;
        result.jobs = jobs;
      } finally {
        await page.close();
      }
    } catch (err) {
      result.error = (err as Error).message;
      result.fallback = true;
    }

    return result;
  }

  private getStrategy(url: string): BaseStrategy {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      // Match by suffix (handles subdomains)
      for (const [domain, strategy] of this.strategies) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return strategy;
        }
      }
    } catch {
      // Invalid URL — fall through to generic
    }
    return this.generic;
  }
}

// Re-exports
export { BaseStrategy, type DeepLinkResult } from './strategies/base.js';
export { TelegramScraper } from './telegram-scraper.js';
export { extractButtonLinks } from './button-links.js';
export type { ExtractedJob } from '@tja/shared';
