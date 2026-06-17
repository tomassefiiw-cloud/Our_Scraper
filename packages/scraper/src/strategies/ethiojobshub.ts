/**
 * ethiojobshub.com strategy — WordPress job board, usually no bot protection.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class EthioJobsHubStrategy extends BaseStrategy {
  readonly domain = 'ethiojobshub.com';

  async extract(page: Page): Promise<Partial<ExtractedJob>[]> {
    await this.waitForAny(page, ['.job-listing', 'article', '.entry-content', 'main'], 8000);

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll('.job-listing, article, .post');
      if (cards.length === 0) {
        // Single job page
        return [
          {
            title: document.querySelector('h1, .entry-title')?.textContent?.trim() ?? null,
            description:
              document.querySelector('.entry-content, .job-description')?.innerText?.trim() ?? null,
            deadline: document.body.innerText.match(/Deadline[:\s]+([\w,\s/]+)/i)?.[1] ?? null,
          },
        ];
      }
      return Array.from(cards).map((c) => {
        const el = c as HTMLElement;
        return {
          title: el.querySelector('h2, h3, .entry-title, .title')?.textContent?.trim() ?? null,
          company_name: el.querySelector('.company, [class*="company"]')?.textContent?.trim() ?? null,
          link: el.querySelector('a')?.href ?? null,
        };
      });
    });
    return jobs.filter((j) => j.title);
  }
}
