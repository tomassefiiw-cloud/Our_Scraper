/**
 * Redis / ioredis singleton (used for rate limiting + push sub cache).
 */
import IORedis from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var __tjaRedis: IORedis | undefined;
}

export const redis =
  globalThis.__tjaRedis ??
  new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__tjaRedis = redis;
}
