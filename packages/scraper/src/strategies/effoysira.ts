/**
 * effoysira.com strategy — WordPress, structured with box-character markers.
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class EffoySiraStrategy extends BaseStrategy {
  readonly domain = 'effoysira.com';

  async extract(page: Page): Promise<Partial<ExtractedJob>[]> {
    await this.waitForAny(page, ['article', '.entry-content', 'main'], 8000);
    const data = await page.evaluate(() => {
      const body = document.querySelector('.entry-content, article, main')?.innerText ?? '';
      const email = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
      return {
        title: document.querySelector('h1, .entry-title')?.textContent?.trim() ?? null,
        description: body,
        application_email: email,
        deadline: body.match(/Deadline[:\s]+([\w,\s/]+)/i)?.[1] ?? null,
      };
    });
    return [data];
  }
}
