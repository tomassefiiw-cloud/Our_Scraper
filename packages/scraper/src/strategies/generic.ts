/**
 * Generic fallback strategy — used when no domain-specific strategy matches.
 *
 * Tries common selectors; if all fail, returns empty so the navigator
 * falls back to Telegram-only extraction (doc §9.2).
 */
import type { Page } from 'puppeteer';
import type { ExtractedJob } from '@tja/shared';
import { BaseStrategy } from './base.js';

export class GenericStrategy extends BaseStrategy {
  readonly domain = '*';

  async extract(page: Page): Promise<Partial<ExtractedJob>[]> {
    if (await this.detectBlocking(page)) {
      throw new Error('Bot detection triggered on generic strategy');
    }

    await this.waitForAny(page, ['article', 'main', '.job', '[class*="job"]'], 8000);
    const data = await page.evaluate(() => {
      const body = document.body?.innerText ?? '';
      const email = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
      const deadlineMatch = body.match(/Deadline[:\s]+([\w,\s/]+)/i)?.[1] ?? null;
      return {
        title: document.querySelector('h1')?.textContent?.trim() ?? null,
        description: body.slice(0, 10000),
        application_email: email,
        deadline: deadlineMatch,
      };
    });
    return [data];
  }
}
