/**
 * One-shot scraper — used by `pnpm scrape:once`.
 *
 * Usage:
 *   pnpm --filter @tja/worker run scrape:once            # all channels
 *   pnpm --filter @tja/worker run scrape:once -- elelanajobs
 */
import { prisma } from '@tja/db';
import { scrapeChannel } from './pipeline.js';

async function main() {
  const target = process.argv[2];
  if (target) {
    const channel = await prisma.channel.findUnique({ where: { telegramUsername: target } });
    if (!channel) {
      console.error(`Channel not found: ${target}`);
      process.exit(1);
    }
    const result = await scrapeChannel(channel.id, channel.telegramUsername);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const channels = await prisma.channel.findMany({ where: { isActive: true } });
    console.log(`Scraping ${channels.length} channels...`);
    for (const c of channels) {
      const result = await scrapeChannel(c.id, c.telegramUsername);
      console.log(`  ${c.telegramUsername}: ${result.jobsExtracted} jobs, ${result.jobsDuplicates} dupes, ${result.errors.length} errors`);
    }
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('scrape:once failed:', err);
  process.exit(1);
});
