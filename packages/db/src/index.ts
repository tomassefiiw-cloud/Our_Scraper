/**
 * @tja/db — Prisma client singleton + helpers.
 */
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __tjaPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__tjaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__tjaPrisma = prisma;
}

export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
