/**
 * Worker entrypoint — starts all BullMQ workers + cron scheduler.
 */
import { scrapeWorker } from './workers/scrape.worker.js';
import { notifyWorker } from './workers/notify.worker.js';
import { startCron } from './cron.js';

console.log('[worker] starting BullMQ workers...');
console.log('[worker] scrape worker concurrency:', scrapeWorker.opts?.concurrency);
console.log('[worker] notify worker concurrency:', notifyWorker.opts?.concurrency);

startCron();

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`[worker] received ${signal}, shutting down...`);
  await Promise.allSettled([scrapeWorker.close(), notifyWorker.close()]);
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
