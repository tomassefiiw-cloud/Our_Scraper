/**
 * Admin dashboard routes — /admin
 *
 * GET /admin/stats       — system-level stats (jobs, channels, scrape logs summary)
 * GET /admin/jobs/recent — recent jobs across all channels (with extraction method breakdown)
 */
import { Router } from 'express';
import { prisma } from '@tja/db';
import { adminRequired, authRequired } from '../middleware/auth.js';

export const adminRouter = Router();

adminRouter.get('/stats', authRequired, adminRequired, async (_req, res, next) => {
  try {
    const [
      totalJobs,
      totalChannels,
      activeChannels,
      openJobs,
      closedJobs,
      last24hLogs,
      extractionMethodBreakdown,
    ] = await Promise.all([
      prisma.job.count(),
      prisma.channel.count(),
      prisma.channel.count({ where: { isActive: true } }),
      prisma.job.count({ where: { isClosed: false } }),
      prisma.job.count({ where: { isClosed: true } }),
      prisma.scrapeLog.count({
        where: { startedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.job.groupBy({
        by: ['extractionMethod'],
        _count: true,
      }),
    ]);

    const aiProviderBreakdown = await prisma.job.groupBy({
      by: ['aiProviderUsed'],
      _count: true,
    });

    res.json({
      totals: {
        jobs: totalJobs,
        openJobs,
        closedJobs,
        channels: totalChannels,
        activeChannels,
        scrapeLogs24h: last24hLogs,
      },
      extractionMethods: extractionMethodBreakdown.reduce(
        (acc, e) => ({ ...acc, [e.extractionMethod]: e._count }),
        {} as Record<string, number>,
      ),
      aiProviders: aiProviderBreakdown.reduce(
        (acc, p) => ({ ...acc, [p.aiProviderUsed ?? 'unknown']: p._count }),
        {} as Record<string, number>,
      ),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/jobs/recent', authRequired, adminRequired, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
    const jobs = await prisma.job.findMany({
      orderBy: { scrapedAt: 'desc' },
      take: limit,
      include: { channel: { select: { telegramUsername: true, displayName: true } } },
    });
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/channels/health', authRequired, adminRequired, async (_req, res, next) => {
  try {
    const channels = await prisma.channel.findMany({
      orderBy: { telegramUsername: 'asc' },
      include: {
        _count: { select: { jobs: true, rawMessages: true } },
      },
    });
    res.json({
      channels: channels.map((c) => ({
        id: c.id,
        username: c.telegramUsername,
        displayName: c.displayName,
        isActive: c.isActive,
        lastScrapedAt: c.lastScrapedAt,
        lastError: c.lastError,
        errorCount: c.errorCount,
        jobsCount: c._count.jobs,
        rawMessagesCount: c._count.rawMessages,
      })),
    });
  } catch (err) {
    next(err);
  }
});
