/**
 * POST /api/extract — AI-extract jobs from a raw Telegram message.
 *
 * Body:
 *   { channel: string, message_text: string, links: string[] }
 *
 * Response:
 *   { jobs: ExtractedJob[], provider: string }
 *
 * AI provider keys stay server-side; client never sees them.
 */

import { NextResponse } from 'next/server';
import { extractJobs } from '@/lib/extractor';
import { getChannelConfig } from '@/lib/channels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { channel?: string; message_text?: string; links?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { channel, message_text, links } = body;
  if (!channel || typeof message_text !== 'string') {
    return NextResponse.json(
      { error: 'Missing required fields: channel, message_text' },
      { status: 400 },
    );
  }

  const config = getChannelConfig(channel);
  if (!config) {
    return NextResponse.json({ error: `Unknown channel: ${channel}` }, { status: 404 });
  }

  try {
    const result = await extractJobs(message_text, links ?? [], config);
    return NextResponse.json({
      jobs: result.jobs.map((j) => ({ ...j, _provider: result.provider })),
      provider: result.provider,
    });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json(
      { error: msg },
      { status: 502 },
    );
  }
}
