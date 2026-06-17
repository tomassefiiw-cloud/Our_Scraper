/**
 * Channels routes — /channels
 *
 * GET  /channels           — list all channels (admin: full config, user: subset)
 * PATCH /channels/:id      — toggle isActive, update scrape config (admin only)
 */
import { Router } from 'express';
import { prisma } from '@tja/db';
import { adminRequired, authRequired, type AuthedRequest } from '../middleware/auth.js';

export const channelsRouter = Router();

channelsRouter.get('/', authRequired, async (_req: AuthedRequest, res, next) => {
  try {
    const channels = await prisma.channel.findMany({
      orderBy: { telegramUsername: 'asc' },
      select: {
        id: true,
        telegramUsername: true,
        displayName: true,
        channelType: true,
        isActive: true,
        lastScrapedAt: true,
        lastError: true,
        errorCount: true,
      },
    });
    res.json({ channels });
  } catch (err) {
    next(err);
  }
});

channelsRouter.patch('/:id', authRequired, adminRequired, async (req: AuthedRequest, res, next) => {
  try {
    const allowed = ['isActive', 'displayName', 'scrapeConfig', 'extractionProfile'] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in req.body) data[k] = req.body[k];
    }
    const channel = await prisma.channel.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ channel });
  } catch (err) {
    next(err);
  }
});
