/**
 * Cron scheduler — runs the scrape pipeline every SCRAPE_INTERVAL_MINUTES (default 30).
 */
import cron from 'node-cron';
import { prisma } from '@tja/db';
import { scrapeQueue } from './queues.js';

export function startCron(): void {
  const intervalMinutes = parseInt(
    process.env.SCRAPE_INTERVAL_MINUTES ?? '30',
    10,
  );

  // Build a cron expression: "*/N * * * *"
  const expr = `*/${Math.max(1, Math.min(59, intervalMinutes))} * * * *`;
  console.log(`[cron] scheduling scrape every ${intervalMinutes} min: ${expr}`);

  cron.schedule(expr, async () => {
    console.log(`[cron] tick ${new Date().toISOString()} — enqueuing scrape for all active channels`);
    try {
      const channels = await prisma.channel.findMany({ where: { isActive: true } });
      for (const c of channels) {
        await scrapeQueue.add('scrape', { channelId: c.id, username: c.telegramUsername });
      }
      console.log(`[cron] enqueued ${channels.length} scrape jobs`);
    } catch (err) {
      console.error('[cron] failed:', (err as Error).message);
    }
  });
}
