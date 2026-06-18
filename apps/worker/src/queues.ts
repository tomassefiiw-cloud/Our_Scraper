/**
 * Worker-side queue connections (separate from API to avoid blocking).
 */
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const scrapeQueue = new Queue('scrape', { connection });
export const extractQueue = new Queue('extract', { connection });
export const deepLinkQueue = new Queue('deeplink', { connection });
export const notifyQueue = new Queue('notify', { connection });

// Helper: create a worker with consistent error handling
export function makeWorker<T>(
  queueName: string,
  handler: (job: { id?: string; data: T; attemptsMade: number }) => Promise<unknown>,
  opts: { concurrency?: number } = {},
): Worker {
  return new Worker<T>(
    queueName,
    async (job) => {
      try {
        return await handler(job);
      } catch (err) {
        console.error(`[worker:${queueName}] job ${job.id} failed:`, (err as Error).message);
        throw err;
      }
    },
    { connection, concurrency: opts.concurrency ?? 1 },
  );
}
