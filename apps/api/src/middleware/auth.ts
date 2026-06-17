/**
 * Auth middleware — verifies JWT bearer token, attaches req.user.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@tja/db';

export interface AuthedRequest extends Request {
  user?: { id: string; email: string };
}

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
    const payload = jwt.verify(token, secret) as { id: string; email: string };
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authOptional(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const secret = process.env.JWT_SECRET ?? 'dev-secret-change-me';
      const payload = jwt.verify(header.slice('Bearer '.length), secret) as {
        id: string;
        email: string;
      };
      req.user = { id: payload.id, email: payload.email };
    } catch {
      // ignore
    }
  }
  next();
}

/**
 * Admin guard — checks user.isActive and a 'displayName' = 'Admin' convention
 * for now. Replace with proper role check when RBAC is added.
 */
export async function adminRequired(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !user.isActive || user.displayName !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
