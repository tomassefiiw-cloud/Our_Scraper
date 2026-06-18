/**
 * User preferences routes — /prefs
 *
 * GET  /prefs      — current user's preferences
 * PUT  /prefs      — update preferences
 */
import { Router } from 'express';
import { prisma } from '@tja/db';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

export const prefsRouter = Router();

prefsRouter.get('/', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const prefs = await prisma.userPreferences.upsert({
      where: { userId: req.user!.id },
      update: {},
      create: { userId: req.user!.id },
    });
    res.json({ prefs });
  } catch (err) {
    next(err);
  }
});

prefsRouter.put('/', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const allowed: (keyof typeof prisma.userPreferences.fields)[] = [
      'minExperienceYears',
      'maxExperienceYears',
      'jobCategories',
      'locations',
      'addisAbabaAreas',
      'workTypes',
      'employmentTypes',
      'excludeKeywords',
      'minSalaryEtb',
      'maxSalaryEtb',
      'notifyPush',
      'notifyEmail',
      'purgeAfterDays',
    ];

    const data: Record<string, unknown> = {};
    for (const key of Object.keys(req.body)) {
      const field = key as keyof typeof prisma.userPreferences.fields;
      if (allowed.includes(field)) {
        data[key] = req.body[key];
      }
    }

    const prefs = await prisma.userPreferences.upsert({
      where: { userId: req.user!.id },
      update: data,
      create: { userId: req.user!.id, ...data },
    });
    res.json({ prefs });
  } catch (err) {
    next(err);
  }
});
