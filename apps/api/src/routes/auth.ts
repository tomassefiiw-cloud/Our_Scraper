/**
 * Auth routes — /auth
 *
 * POST /auth/signup    — email + password -> create user + return JWT
 * POST /auth/login     — email + password -> return JWT
 * GET  /auth/me        — return current user
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '@tja/db';
import { authRequired, type AuthedRequest } from '../middleware/auth.js';

export const authRouter = Router();

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function signToken(user: { id: string; email: string }): string {
  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
  return jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '7d' });
}

authRouter.post('/signup', async (req, res, next) => {
  try {
    const parsed = SignupSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    const passwordHash = await bcrypt.hash(parsed.password, 10);
    const user = await prisma.user.create({
      data: {
        email: parsed.email,
        passwordHash,
        displayName: parsed.displayName,
      },
    });
    // Create default empty preferences
    await prisma.userPreferences.create({ data: { userId: user.id } });
    res.status(201).json({ token: signToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const ok = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authRequired, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, displayName: true, isActive: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});
