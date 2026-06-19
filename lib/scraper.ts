/**
 * Telegram scraper — server-side only.
 *
 * Fetches t.me/s/<channel> and parses messages via Cheerio.
 * Lives in /api/scrape/[channel]/route.ts (Next.js server route).
 */

import * as cheerio from 'cheerio';
import { TELEGRAM_WEB_BASE, USER_AGENT } from './channels';

export interface RawMessage {
  telegram_msg_id: number;
  channel_username: string;
  message_text: string;
  message_html: string;
  posted_at: string; // ISO string
  views: number;
  extracted_links: { url: string; text: string; is_button: boolean }[];
}

/**
 * Fetch and parse the latest messages from a Telegram channel's public webview.
 * Returns newest-first.
 */
export async function scrapeChannel(
  channelUsername: string,
  limit = 30,
): Promise<RawMessage[]> {
  const url = `${TELEGRAM_WEB_BASE}${channelUsername}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,am;q=0.8',
    },
    // Telegram CDN is fast; 15s is plenty
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Telegram fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseMessages(html, channelUsername, limit);
}

function parseMessages(html: string, channelUsername: string, limit: number): RawMessage[] {
  const $ = cheerio.load(html);
  const messages: RawMessage[] = [];

  $('.tgme_widget_message').each((_, el) => {
    const $msg = $(el);
    const postAttr = $msg.attr('data-post');
    const msgId = postAttr ? parseInt(postAttr.split('/')[1] ?? '0', 10) : 0;
    if (!msgId) return;

    const $textEl = $msg.find('.tgme_widget_message_text');
    const text = $textEl.text().trim();
    const htmlContent = $textEl.html() ?? '';
    const viewsText = $msg.find('.tgme_widget_message_views').text().replace(/\D/g, '');
    const views = parseInt(viewsText || '0', 10);
    const datetime = $msg.find('time').attr('datetime');

    const links = extractLinks($msg, $);

    messages.push({
      telegram_msg_id: msgId,
      channel_username: channelUsername,
      message_text: text,
      message_html: htmlContent,
      posted_at: datetime ?? new Date().toISOString(),
      views: Number.isNaN(views) ? 0 : views,
      extracted_links: links,
    });
  });

  // Telegram renders newest last; reverse + slice
  return messages.reverse().slice(0, limit);
}

function extractLinks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $msg: any,
  $: cheerio.CheerioAPI,
): RawMessage['extracted_links'] {
  const links: RawMessage['extracted_links'] = [];
  const seen = new Set<string>();

  // Inline URLs in message text
  $msg.find('.tgme_widget_message_text a').each((_i: number, a: any) => {
    const href = $(a).attr('href');
    const text = $(a).text().trim();
    if (href && !href.startsWith('javascript:') && !seen.has(href)) {
      seen.add(href);
      links.push({ url: href, text, is_button: false });
    }
  });

  // Inline reply-keyboard buttons (hahujobs "Apply" button etc.)
  $msg.find('.tgme_widget_message_inline_button').each((_bi: number, btn: any) => {
    const href = $(btn).attr('href');
    const text = $(btn).text().trim();
    if (href && !href.startsWith('javascript:') && !seen.has(href)) {
      seen.add(href);
      links.push({ url: href, text, is_button: true });
    }
  });

  return links;
}
