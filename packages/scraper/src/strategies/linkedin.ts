/**
 * linkedin.com strategy — heavily bot-protected.
 *
 * Per doc §9, LinkedIn is L6 (anti-bot). Strategy: attempt with stealth,
 * detect blocking immediately, and signal fallback rather than waste time.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class LinkedInStrategy extends BaseStrategy {
  readonly domain = 'linkedin.com';

  async extract(page: Page, url: string): Promise<Partial<ExtractedJob>[]> {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined);

    if (await this.detectBlocking(page)) {
      // Signal fallback by returning empty; navigator will mark telegram_only
      throw new Error('LinkedIn anti-bot triggered — skipping deep extraction');
    }

    const data = await page.evaluate(() => ({
      title: document.querySelector('h1, .top-card-layout__title')?.textContent?.trim() ?? null,
      company_name:
        document.querySelector('.topcard__org-name-link, .topcard__flavor')?.textContent?.trim() ?? null,
      location:
        document.querySelector('.topcard__flavor--bullet, .job-flavor')?.textContent?.trim() ?? null,
      description:
        document.querySelector('.description__text, .show-more-less-html__markup')?.innerText?.trim() ??
        null,
    }));
    return [data];
  }
}
