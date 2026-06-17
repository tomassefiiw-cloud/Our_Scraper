/**
 * Push subscription routes — /push
 *
 * POST /push/subscribe   — register a browser push subscription (VAPID)
 * POST /push/unsubscribe — remove a subscription
 */
import { Router } from 'express';
import { prisma } from '@tja/db';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

export const pushRouter = Router();

pushRouter.post('/subscribe', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'Missing endpoint or keys' });
      return;
    }
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        keysP256dh: keys.p256dh,
        keysAuth: keys.auth,
        userAgent: req.headers['user-agent'],
      },
      create: {
        userId: req.user!.id,
        endpoint,
        keysP256dh: keys.p256dh,
        keysAuth: keys.auth,
        userAgent: req.headers['user-agent'],
      },
    });
    res.status(201).json({ id: sub.id });
  } catch (err) {
    next(err);
  }
});

pushRouter.post('/unsubscribe', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const { endpoint } = req.body ?? {};
    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint' });
      return;
    }
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user!.id },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
