/**
 * ethiojobs.net strategy (doc §6.3, §17).
 *
 * Deep link: company page -> stack of ALL jobs (open + expired) ->
 * find "Read More" buttons, skip "Job Expired" -> follow each for details.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class EthiojobsStrategy extends BaseStrategy {
  readonly domain = 'ethiojobs.net';

  async extract(page: Page, url: string): Promise<Partial<ExtractedJob>[]> {
    await page.waitForSelector('.job-card, .vacancy-card, [class*="job"]', { timeout: 10000 });

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll('.job-card, .vacancy-card, .job-listing');
      return Array.from(cards).map((card) => {
        const el = card as HTMLElement;
        const isExpired = !!el.querySelector('.expired, [class*="expired"]');
        const readMoreBtn = el.querySelector('.read-more, [class*="read-more"], .view-more, a[href*="job"]');
        return {
          title: el.querySelector('h3, h4, .job-title, .title')?.textContent?.trim() ?? null,
          company_name: el.querySelector('.company, [class*="company"]')?.textContent?.trim() ?? null,
          location: el.querySelector('.location, [class*="location"]')?.textContent?.trim() ?? null,
          postedDate: el.querySelector('.date, [class*="date"]')?.textContent?.trim() ?? null,
          isExpired,
          readMoreLink: readMoreBtn?.getAttribute('href') ?? null,
        };
      });
    });

    const openJobs = jobs.filter((j) => !j.isExpired && j.readMoreLink && j.title);

    const detailed: Partial<ExtractedJob>[] = [];
    for (const job of openJobs.slice(0, 3)) {
      try {
        const link = job.readMoreLink!.startsWith('http')
          ? job.readMoreLink!
          : new URL(job.readMoreLink!, url).href;
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 20000 });
        const details = await page.evaluate(() => ({
          description:
            document.querySelector('.job-details, [class*="detail"], .entry-content')?.innerText?.trim() ??
            null,
          requirements:
            document.querySelector('.requirements, [class*="requirement"]')?.innerText?.trim() ?? null,
          deadline:
            document.querySelector('.deadline, [class*="deadline"]')?.textContent?.trim() ?? null,
          salary: document.querySelector('.salary, [class*="salary"]')?.textContent?.trim() ?? null,
        }));
        detailed.push({ ...job, ...details });
      } catch {
        detailed.push(job);
      }
    }
    return detailed;
  }
}
