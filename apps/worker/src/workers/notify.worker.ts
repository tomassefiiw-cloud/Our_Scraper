/**
 * Notification worker — sends web push notifications to subscribed users.
 */
import webpush from 'web-push';
import { prisma } from '@tja/db';
import { makeWorker } from '../queues.js';

// Configure VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:you@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

interface NotifyData {
  userId: string;
  jobId: string;
  title: string | null;
  company: string | null;
}

export const notifyWorker = makeWorker<NotifyData>('notify', async (job) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    console.warn('[notify-worker] VAPID keys not configured — skipping');
    return;
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: job.data.userId },
  });
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: 'New Job Match!',
    body: `${job.data.company ?? 'Unknown'} — ${job.data.title ?? 'Position'}`,
    jobId: job.data.jobId,
    url: `/jobs/${job.data.jobId}`,
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keysP256dh, auth: sub.keysAuth },
        },
        payload,
      );
      await prisma.notificationLog.create({
        data: { userId: job.data.userId, jobId: job.data.jobId, channel: 'push', status: 'sent' },
      });
    } catch (err) {
      const msg = (err as Error).message;
      await prisma.notificationLog.create({
        data: {
          userId: job.data.userId,
          jobId: job.data.jobId,
          channel: 'push',
          status: 'failed',
          error: msg.slice(0, 500),
        },
      });
      // 410 Gone = subscription expired — remove
      if ((err as { statusCode?: number }).statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      }
    }
  }
});
