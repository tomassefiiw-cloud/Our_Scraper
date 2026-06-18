/**
 * GET /api/channels — list all configured channels.
 *
 * Response:
 *   { channels: ChannelConfig[] }
 */

import { NextResponse } from 'next/server';
import { CHANNEL_CONFIGS } from '@/lib/channels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    channels: CHANNEL_CONFIGS,
    count: CHANNEL_CONFIGS.length,
  });
}
