/**
 * Button-link extraction helper (doc §9.3).
 *
 * hahujobs and geezjobs use Telegram inline reply-keyboard buttons
 * (Details / Apply) instead of raw URLs in message text. This helper
 * extracts them from a message's HTML.
 */
import * as cheerio from 'cheerio';
import type { ExtractedLink } from '@tja/shared';

export function extractButtonLinks(messageHtml: string): ExtractedLink[] {
  if (!messageHtml) return [];
  const $ = cheerio.load(messageHtml);
  const buttons: ExtractedLink[] = [];
  const seen = new Set<string>();

  $('.tgme_widget_message_inline_button, .reply_markup_button').each((_, btn) => {
    const text = $(btn).text().trim().toLowerCase();
    const href = $(btn).attr('href');
    if (!href || href.startsWith('javascript:')) return;

    const isJobAction =
      text.includes('detail') ||
      text.includes('apply') ||
      text.includes('read more') ||
      text.includes('view') ||
      text.includes('link');

    if (isJobAction && !seen.has(href)) {
      seen.add(href);
      buttons.push({ url: href, text: $(btn).text().trim(), isButton: true });
    }
  });

  return buttons;
}
