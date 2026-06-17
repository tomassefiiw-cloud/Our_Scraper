/**
 * AI provider settings routes — /settings
 *
 * GET    /settings/ai-providers     — list current user's AI provider configs
 * POST   /settings/ai-providers     — add a new provider config
 * PATCH  /settings/ai-providers/:id — update config (api_key, priority, is_active)
 * DELETE /settings/ai-providers/:id — remove config
 */
import { Router } from 'express';
import { prisma } from '@tja/db';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

export const settingsRouter = Router();

settingsRouter.get('/ai-providers', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    // User sees their own configs + system defaults (user_id = null)
    const configs = await prisma.aiProviderConfig.findMany({
      where: { OR: [{ userId: req.user!.id }, { userId: null }] },
      orderBy: { priority: 'asc' },
    });
    // Don't leak api keys — mask them
    const masked = configs.map((c) => ({
      ...c,
      apiKey: c.apiKey ? maskKey(c.apiKey) : null,
    }));
    res.json({ configs: masked });
  } catch (err) {
    next(err);
  }
});

settingsRouter.post('/ai-providers', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const config = await prisma.aiProviderConfig.create({
      data: {
        userId: req.user!.id,
        providerName: req.body.provider_name,
        apiKey: req.body.api_key,
        apiBaseUrl: req.body.api_base_url,
        modelName: req.body.model_name,
        isActive: req.body.is_active ?? true,
        priority: req.body.priority ?? 10,
        rateLimitRpm: req.body.rate_limit_rpm ?? 15,
        dailyQuota: req.body.daily_quota ?? 1500,
        isLocal: req.body.is_local ?? false,
        ollamaUrl: req.body.ollama_url,
      },
    });
    res.status(201).json({ config: { ...config, apiKey: maskKey(config.apiKey ?? '') } });
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch('/ai-providers/:id', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.aiProviderConfig.findUnique({ where: { id: req.params.id } });
    if (!existing || (existing.userId !== null && existing.userId !== req.user!.id)) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }
    const allowed = [
      'apiKey',
      'apiBaseUrl',
      'modelName',
      'isActive',
      'priority',
      'rateLimitRpm',
      'dailyQuota',
      'isLocal',
      'ollamaUrl',
    ];
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in req.body) data[k] = req.body[k];
    }
    const updated = await prisma.aiProviderConfig.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ config: { ...updated, apiKey: maskKey(updated.apiKey ?? '') } });
  } catch (err) {
    next(err);
  }
});

settingsRouter.delete('/ai-providers/:id', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.aiProviderConfig.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user!.id) {
      res.status(404).json({ error: 'Config not found or not deletable' });
      return;
    }
    await prisma.aiProviderConfig.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
