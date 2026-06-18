/**
 * afriworket.com strategy — freelance_ethio's external site.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class AfriworkStrategy extends BaseStrategy {
  readonly domain = 'afriworket.com';

  async extract(page: Page): Promise<Partial<ExtractedJob>[]> {
    await this.waitForAny(page, ['.job-detail', '.job-info', 'article', 'main'], 8000);
    const data = await page.evaluate(() => ({
      title: document.querySelector('h1, .job-title')?.textContent?.trim() ?? null,
      company_name:
        document.querySelector('.company-name, [class*="company"]')?.textContent?.trim() ?? null,
      description:
        document.querySelector('.job-description, .description, main')?.innerText?.trim() ?? null,
      salary: document.querySelector('.salary, [class*="salary"]')?.textContent?.trim() ?? null,
      deadline: document.querySelector('.deadline, [class*="deadline"]')?.textContent?.trim() ?? null,
    }));
    return [data];
  }
}
