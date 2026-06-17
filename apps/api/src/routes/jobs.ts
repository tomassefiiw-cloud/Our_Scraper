/**
 * Jobs routes — /jobs
 *
 * GET  /jobs               — paginated feed with filters (infinite scroll via cursor)
 * GET  /jobs/:id           — single job detail
 * POST /jobs/:id/interact  — record user interaction (viewed/saved/hidden/applied/dismissed)
 * GET  /jobs/saved         — jobs the current user has saved
 */
import { Router } from 'express';
import { prisma } from '@tja/db';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

export const jobsRouter = Router();

const PAGE_SIZE = 20;

// GET /jobs?q=...&category=tech&location=Addis+Ababa&remote=true&cursor=...
jobsRouter.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const categories = req.query.category
      ? Array.isArray(req.query.category)
        ? (req.query.category as string[])
        : [req.query.category as string]
      : undefined;
    const locations = req.query.location
      ? Array.isArray(req.query.location)
        ? (req.query.location as string[])
        : [req.query.location as string]
      : undefined;
    const remote = req.query.remote === 'true' ? true : undefined;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) ?? `${PAGE_SIZE}`, 10), 50);

    // If user is authenticated, merge their preferences as default filters
    let prefsFilter: Record<string, unknown> = {};
    if (req.user) {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId: req.user.id } });
      if (prefs) {
        prefsFilter = {
          jobCategory: prefs.jobCategories.length ? { in: prefs.jobCategories } : undefined,
          locationCity: prefs.locations.length ? { in: prefs.locations } : undefined,
          isClosed: false,
        };
      }
    }

    // Build where
    const where: Record<string, unknown> = {
      isClosed: false,
      ...(prefsFilter.jobCategory ? { jobCategory: prefsFilter.jobCategory } : {}),
      ...(prefsFilter.locationCity ? { locationCity: prefsFilter.locationCity } : {}),
      ...(categories?.length ? { jobCategory: { in: categories } } : {}),
      ...(locations?.length ? { locationCity: { in: locations } } : {}),
      ...(remote !== undefined ? { isRemote: remote } : {}),
      ...(q
        ? {
            searchVector: {
              search: q.split(/\s+/).join(' & '),
            },
          }
        : {}),
      ...(cursor ? { postedAt: { lt: new Date(cursor) } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        take: limit + 1,
        include: { channel: { select: { telegramUsername: true, displayName: true } } },
      }),
      prisma.job.count({ where }),
    ]);

    const hasMore = items.length > limit;
    const visible = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && visible.length > 0
      ? (visible[visible.length - 1].postedAt?.toISOString() ?? null)
      : null;

    res.json({
      items: visible,
      total,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    next(err);
  }
});

// GET /jobs/:id
jobsRouter.get('/:id', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { channel: { select: { telegramUsername: true, displayName: true } } },
    });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Record view interaction
    if (req.user) {
      await prisma.userJobInteraction
        .upsert({
          where: {
            userId_jobId_action: { userId: req.user.id, jobId: job.id, action: 'viewed' },
          },
          update: {},
          create: { userId: req.user.id, jobId: job.id, action: 'viewed' },
        })
        .catch(() => undefined);
    }
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

// POST /jobs/:id/interact  body: { action: 'saved'|'hidden'|'applied'|'dismissed' }
jobsRouter.post('/:id/interact', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const action = (req.body.action as string) || 'viewed';
    const validActions = ['viewed', 'saved', 'hidden', 'applied', 'dismissed'];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: `Invalid action. Valid: ${validActions.join(', ')}` });
      return;
    }
    const interaction = await prisma.userJobInteraction.upsert({
      where: {
        userId_jobId_action: { userId: req.user!.id, jobId: req.params.id, action },
      },
      update: {},
      create: { userId: req.user!.id, jobId: req.params.id, action },
    });
    res.json({ interaction });
  } catch (err) {
    next(err);
  }
});

// GET /jobs/saved
jobsRouter.get('/saved/all', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const saved = await prisma.userJobInteraction.findMany({
      where: { userId: req.user!.id, action: 'saved' },
      orderBy: { createdAt: 'desc' },
      include: { job: { include: { channel: { select: { displayName: true } } } } },
    });
    res.json({ items: saved.map((s) => s.job) });
  } catch (err) {
    next(err);
  }
});
