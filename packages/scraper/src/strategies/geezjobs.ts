/**
 * geezjobs.com strategy.
 * Direct job page — most data already in Telegram message, deep link is supplementary.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class GeezJobsStrategy extends BaseStrategy {
  readonly domain = 'geezjobs.com';

  async extract(page: Page): Promise<Partial<ExtractedJob>[]> {
    await this.waitForAny(page, ['.job-detail', '.entry-content', 'article', 'main'], 8000);
    const data = await page.evaluate(() => ({
      title: document.querySelector('h1, .job-title, .entry-title')?.textContent?.trim() ?? null,
      company_name:
        document.querySelector('.company-name, [class*="company"]')?.textContent?.trim() ?? null,
      description:
        document.querySelector('.job-description, .entry-content, article')?.innerText?.trim() ?? null,
      deadline:
        document.querySelector('.deadline, [class*="deadline"]')?.textContent?.trim() ?? null,
      salary: document.querySelector('.salary, [class*="salary"]')?.textContent?.trim() ?? null,
    }));
    return [data];
  }
}
