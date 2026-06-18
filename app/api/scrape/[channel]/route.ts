/**
 * GET /api/scrape/[channel] — fetches latest messages from a Telegram channel.
 * Server-side only (avoids CORS — browser cannot fetch t.me directly).
 *
 * Response:
 *   { messages: RawMessage[] }
 */

import { NextResponse } from 'next/server';
import { scrapeChannel } from '@/lib/scraper';
import { getChannelConfig } from '@/lib/channels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: { channel: string } },
) {
  const channelUsername = params.channel;
  const config = getChannelConfig(channelUsername);

  if (!config) {
    return NextResponse.json(
      { error: `Unknown channel: ${channelUsername}` },
      { status: 404 },
    );
  }

  try {
    const messages = await scrapeChannel(channelUsername, config.fetchLimit);
    return NextResponse.json({
      channel: channelUsername,
      messages,
      count: messages.length,
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json(
      { error: msg, channel: channelUsername },
      { status: 502 },
    );
  }
}
