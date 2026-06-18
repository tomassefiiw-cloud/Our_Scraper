/**
 * Shared BullMQ queues — used by both the API (producer) and the worker (consumer).
 */
import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const scrapeQueue = new Queue('scrape', { connection });
export const extractQueue = new Queue('extract', { connection });
export const deepLinkQueue = new Queue('deeplink', { connection });
export const notifyQueue = new Queue('notify', { connection });

export const scrapeEvents = new QueueEvents('scrape', { connection });

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    scrapeQueue.close(),
    extractQueue.close(),
    deepLinkQueue.close(),
    notifyQueue.close(),
    scrapeEvents.close(),
    connection.quit(),
  ]);
}
