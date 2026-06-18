/**
 * harmeejobs.com strategy (doc §6.3, §17).
 *
 * Deep link: company page -> list of ALL open positions -> click each for details.
 * Multi-job: yes — typically 3-5 positions per company page.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class HarmeeJobsStrategy extends BaseStrategy {
  readonly domain = 'harmeejobs.com';

  async extract(page: Page, url: string): Promise<Partial<ExtractedJob>[]> {
    await page.waitForSelector('.job-listing, .job-item, [class*="job"], .position', { timeout: 10000 });

    const companyName = await page.evaluate(() => {
      return (
        document.querySelector('.company-name, h1, .entry-title')?.textContent?.trim() ?? null
      );
    });

    const jobs = await page.evaluate((company) => {
      const cards = document.querySelectorAll('.job-listing, .job-item, .vacancy, [class*="job-card"]');
      return Array.from(cards).map((card) => {
        const el = card as HTMLElement;
        const text = el.innerText?.toLowerCase() ?? '';
        return {
          title: el.querySelector('h2, h3, .job-title, .title')?.textContent?.trim() ?? null,
          company_name: company,
          location: el.querySelector('.location, [class*="location"]')?.textContent?.trim() ?? null,
          deadline: el.querySelector('.deadline, [class*="deadline"]')?.textContent?.trim() ?? null,
          link: el.querySelector('a')?.href ?? null,
          isExpired: text.includes('expired') || text.includes('closed'),
        };
      });
    }, companyName);

    const openJobs = jobs.filter((j) => !j.isExpired && (j.title || j.link));

    const detailed: Partial<ExtractedJob>[] = [];
    for (const job of openJobs.slice(0, 5)) {
      if (!job.link) {
        detailed.push(job);
        continue;
      }
      try {
        await page.goto(job.link, { waitUntil: 'networkidle2', timeout: 20000 });
        const details = await page.evaluate(() => ({
          description:
            document.querySelector('.job-description, [class*="description"], .entry-content')?.textContent?.trim() ??
            null,
          requirements: Array.from(
            document.querySelectorAll('.requirements li, [class*="requirement"] li'),
          ).map((li) => li.textContent?.trim() ?? ''),
          salary: document.querySelector('.salary, [class*="salary"]')?.textContent?.trim() ?? null,
          how_to_apply:
            document.querySelector('.apply, [class*="apply"], .how-to-apply')?.textContent?.trim() ?? null,
        }));
        detailed.push({ ...job, ...details });
      } catch {
        detailed.push(job);
      }
    }
    return detailed;
  }
}
