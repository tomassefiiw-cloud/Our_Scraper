/**
 * TelegramScraper — scrapes public Telegram channels via t.me/s/<channel>.
 * No API key needed; uses the public webview. (doc §6.1)
 */
import * as cheerio from 'cheerio';
import { TELEGRAM_WEB_BASE, USER_AGENT } from '@tja/shared';
import type { ExtractedLink, RawTelegramMessage } from '@tja/shared';

export class TelegramScraper {
  /**
   * Scrape a single channel. Returns messages newest-first as Telegram
   * renders them, optionally limited to `limit` most recent.
   */
  async scrapeChannel(channelUsername: string, limit = 50): Promise<RawTelegramMessage[]> {
    const url = `${TELEGRAM_WEB_BASE}${channelUsername}`;
    const html = await this.fetchHtml(url);
    return this.parseMessages(html, channelUsername, limit);
  }

  /**
   * Scrape multiple channels in parallel (bounded concurrency).
   */
  async scrapeChannels(usernames: string[], limit = 50, concurrency = 4): Promise<Map<string, RawTelegramMessage[]>> {
    const result = new Map<string, RawTelegramMessage[]>();
    const queue = [...usernames];

    async function worker(scraper: TelegramScraper) {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        try {
          const messages = await scraper.scrapeChannel(next, limit);
          result.set(next, messages);
        } catch (err) {
          console.error(`[scraper] failed for ${next}:`, (err as Error).message);
          result.set(next, []);
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker(this)));
    return result;
  }

  // -----------------------------------------------------------------------

  protected async fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,am;q=0.8',
      },
    });
    if (!response.ok) {
      throw new Error(`Telegram fetch failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  protected parseMessages(html: string, channelUsername: string, limit: number): RawTelegramMessage[] {
    const $ = cheerio.load(html);
    const messages: RawTelegramMessage[] = [];

    $('.tgme_widget_message').each((_, el) => {
      const $msg = $(el);
      const postAttr = $msg.attr('data-post');
      const msgId = postAttr ? parseInt(postAttr.split('/')[1] ?? '0', 10) : 0;
      if (!msgId) return;

      const $textEl = $msg.find('.tgme_widget_message_text');
      const text = $textEl.text().trim();
      const html_content = $textEl.html() ?? '';
      const views = parseInt($msg.find('.tgme_widget_message_views').text().replace(/\D/g, '') || '0', 10);
      const datetime = $msg.find('time').attr('datetime');

      // Extract all links (both inline URLs and inline buttons)
      const links = this.extractLinks($msg, $);

      messages.push({
        telegram_msg_id: msgId,
        channel_username: channelUsername,
        message_text: text,
        message_html: html_content,
        posted_at: datetime ? new Date(datetime) : new Date(),
        views: Number.isNaN(views) ? 0 : views,
        extracted_links: links,
      });
    });

    // Telegram renders newest last; reverse so newest is first, then cap to limit
    return messages.reverse().slice(0, limit);
  }

  private extractLinks($msg: cheerio.Cheerio<cheerio.AnyNode>, $: cheerio.CheerioAPI): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const seen = new Set<string>();

    // Inline URLs in message text
    $msg.find('.tgme_widget_message_text a').each((_, a) => {
      const href = $(a).attr('href');
      const text = $(a).text().trim();
      if (href && !href.startsWith('javascript:') && !seen.has(href)) {
        // Skip internal telegram links (joining channel etc.)
        if (href.startsWith('https://t.me/') && !href.includes('/' + $msg.attr('data-post')?.split('/')[0])) {
          // skip
        } else {
          seen.add(href);
          links.push({ url: href, text, isButton: false });
        }
      }
    });

    // Inline reply-keyboard buttons (e.g. hahujobs "Apply" button)
    $msg.find('.tgme_widget_message_inline_button').each((_, btn) => {
      const href = $(btn).attr('href');
      const text = $(btn).text().trim();
      if (href && !href.startsWith('javascript:') && !seen.has(href)) {
        seen.add(href);
        links.push({ url: href, text, isButton: true });
      }
    });

    return links;
  }
}
