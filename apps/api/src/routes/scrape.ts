/**
 * Scrape trigger routes — /scrape
 *
 * POST /scrape/trigger     — admin: enqueue an immediate scrape for one or all channels
 * GET  /scrape/logs        — admin: recent scrape logs
 */
import { Router } from 'express';
import { prisma } from '@tja/db';
import { adminRequired, authRequired, type AuthedRequest } from '../middleware/auth.js';
import { scrapeQueue } from '../lib/queues.js';

export const scrapeRouter = Router();

scrapeRouter.post('/trigger', authRequired, adminRequired, async (req: AuthedRequest, res, next) => {
  try {
    const channelUsername = req.body.channel as string | undefined; // omit = all
    if (channelUsername) {
      const channel = await prisma.channel.findUnique({
        where: { telegramUsername: channelUsername },
      });
      if (!channel) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }
      await scrapeQueue.add('scrape', { channelId: channel.id, username: channel.telegramUsername });
      res.json({ status: 'queued', channel: channelUsername });
    } else {
      const channels = await prisma.channel.findMany({ where: { isActive: true } });
      await Promise.all(
        channels.map((c) =>
          scrapeQueue.add('scrape', { channelId: c.id, username: c.telegramUsername }),
        ),
      );
      res.json({ status: 'queued', count: channels.length });
    }
  } catch (err) {
    next(err);
  }
});

scrapeRouter.get('/logs', authRequired, adminRequired, async (req: AuthedRequest, res, next) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
    const logs = await prisma.scrapeLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { channel: { select: { telegramUsername: true, displayName: true } } },
    });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});
