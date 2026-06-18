/**
 * hahujobs.com strategy — JavaScript-rendered SPA. Requires waiting for hydration.
 * Often the Telegram inline button is the apply link itself; deep-link extraction
 * may be skipped (deepLinkFollow: 'optional' per channel config).
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class HahuJobsStrategy extends BaseStrategy {
  readonly domain = 'hahujobs.com';

  async extract(page: Page): Promise<Partial<ExtractedJob>[]> {
    // SPAs need extra time to hydrate
    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => undefined);
    await this.waitForAny(page, ['.job-detail', '.job-card', '[class*="Job"]', 'main'], 10000);

    const data = await page.evaluate(() => ({
      title: document.querySelector('h1, [class*="title"]')?.textContent?.trim() ?? null,
      company_name:
        document.querySelector('[class*="company"], [class*="Company"]')?.textContent?.trim() ?? null,
      description:
        document.querySelector('[class*="description"], [class*="Description"], main')?.innerText?.trim() ??
        null,
      salary: document.querySelector('[class*="salary"], [class*="Salary"]')?.textContent?.trim() ?? null,
      how_to_apply:
        document.querySelector('[class*="apply"], [class*="Apply"], a[href*="apply"]')?.textContent?.trim() ??
        null,
    }));
    return [data];
  }
}
