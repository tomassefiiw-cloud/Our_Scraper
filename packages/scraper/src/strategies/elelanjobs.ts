/**
 * elelanajobs.com / elelanjobs.com strategy.
 * Direct job page, often with multiple positions per page.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class ElelanJobsStrategy extends BaseStrategy {
  readonly domain = 'elelanjobs.com';

  async extract(page: Page): Promise<Partial<ExtractedJob>[]> {
    await this.waitForAny(page, ['.job-listing', '.position', 'article', 'main'], 8000);

    const jobs = await page.evaluate(() => {
      // Single job page vs listing
      const singleTitle = document.querySelector('h1, .job-title')?.textContent?.trim();
      if (singleTitle) {
        return [
          {
            title: singleTitle,
            company_name:
              document.querySelector('.company-name, [class*="company"]')?.textContent?.trim() ?? null,
            description:
              document.querySelector('.job-description, .entry-content, article')?.innerText?.trim() ??
              null,
            deadline:
              document.querySelector('.deadline, [class*="deadline"]')?.textContent?.trim() ?? null,
          },
        ];
      }
      // Listing of positions
      const cards = document.querySelectorAll('.job-listing, .position, .vacancy');
      return Array.from(cards).map((c) => {
        const el = c as HTMLElement;
        return {
          title: el.querySelector('h2, h3, .title')?.textContent?.trim() ?? null,
          company_name: el.querySelector('.company, [class*="company"]')?.textContent?.trim() ?? null,
          location: el.querySelector('.location, [class*="location"]')?.textContent?.trim() ?? null,
          link: el.querySelector('a')?.href ?? null,
        };
      });
    });
    return jobs.filter((j) => j.title);
  }
}
