/**
 * Seed script — populates the channels table from the shared channel configs,
 * and creates a default admin user + a default AI provider config slot for
 * each env-supplied provider key.
 *
 * Run: pnpm --filter @tja/db run seed
 */
import { PrismaClient } from '@prisma/client';
import { CHANNEL_CONFIGS } from '@tja/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding channels...');
  for (const cfg of CHANNEL_CONFIGS) {
    await prisma.channel.upsert({
      where: { telegramUsername: cfg.telegram_username },
      update: {
        displayName: cfg.display_name,
        channelType: cfg.channel_type,
        scrapeConfig: cfg as unknown as object,
        extractionProfile: 'default',
        isActive: true,
      },
      create: {
        telegramUsername: cfg.telegram_username,
        displayName: cfg.display_name,
        channelType: cfg.channel_type,
        scrapeConfig: cfg as unknown as object,
        extractionProfile: 'default',
        isActive: true,
      },
    });
    console.log(`  ✓ ${cfg.telegram_username}`);
  }

  // Default admin user (only if env provides credentials)
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH) {
    await prisma.user.upsert({
      where: { email: process.env.ADMIN_EMAIL },
      update: {},
      create: {
        email: process.env.ADMIN_EMAIL,
        passwordHash: process.env.ADMIN_PASSWORD_HASH,
        displayName: 'Admin',
      },
    });
    console.log(`  ✓ admin user (${process.env.ADMIN_EMAIL})`);
  }

  // Seed system-level AI provider configs from env (user_id = null)
  console.log('🌱 Seeding AI provider configs...');
  const providerEnvMap: Record<string, { key?: string; model: string; isLocal?: boolean; ollamaUrl?: string; baseUrl?: string }> = {
    gemini: { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest' },
    deepseek: { key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' },
    claude: { key: process.env.CLAUDE_API_KEY, model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307' },
    openai: { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo' },
    groq: { key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant' },
    openrouter: { key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'google/gemini-flash-1.5' },
    kimi: { key: process.env.KIMI_API_KEY, model: process.env.KIMI_MODEL || 'moonshot-v1-8k' },
    ollama: { key: 'n/a', model: process.env.OLLAMA_MODEL || 'phi4:latest', isLocal: true, ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434' },
  };

  let priority = 0;
  for (const [name, env] of Object.entries(providerEnvMap)) {
    const hasKey = env.isLocal || (env.key && env.key.length > 0);
    if (!hasKey) continue;

    // Find existing system-level config for this provider (user_id IS NULL)
    const existing = await prisma.aiProviderConfig.findFirst({
      where: { providerName: name, userId: null },
    });

    const data = {
      apiKey: env.key,
      modelName: env.model,
      isLocal: env.isLocal ?? false,
      ollamaUrl: env.ollamaUrl,
      apiBaseUrl: env.baseUrl,
      isActive: true,
      priority,
      rateLimitRpm: 15,
      dailyQuota: 1500,
      currentUsage: 0,
      lastResetAt: new Date(),
    };

    if (existing) {
      await prisma.aiProviderConfig.update({ where: { id: existing.id }, data });
    } else {
      await prisma.aiProviderConfig.create({
        data: { ...data, providerName: name, userId: null },
      });
    }
    console.log(`  ✓ ${name} (priority ${priority})`);
    priority++;
  }

  console.log('✅ Seed complete');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
