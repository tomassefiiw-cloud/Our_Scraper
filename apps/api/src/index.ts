/**
 * Express server entrypoint — wires all routes from doc §3.
 *
 *   /jobs, /feed, /auth, /users, /filters, /prefs, /channels,
 *   /scrape, /settings, /admin, /push, /health
 */
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth.js';
import { jobsRouter } from './routes/jobs.js';
import { prefsRouter } from './routes/prefs.js';
import { channelsRouter } from './routes/channels.js';
import { scrapeRouter } from './routes/scrape.js';
import { settingsRouter } from './routes/settings.js';
import { adminRouter } from './routes/admin.js';
import { pushRouter } from './routes/push.js';
import { errorHandler, notFound } from './middleware/error.js';
import { authOptional } from './middleware/auth.js';

const app = express();

// Trust proxy — Codespaces port-forwarding and Next.js rewrites both add
// X-Forwarded-* headers. Without this, express-rate-limit throws
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every proxied request.
app.set('trust proxy', 2);

// ---- Middleware ----------------------------------------------------------
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120, // 120 req/min/IP — generous for PWA polling
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ---- Health check (doc §14.2 — keeps Render/Railway alive) ---------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Routes --------------------------------------------------------------
app.use('/auth', authRouter);
app.use(authOptional); // attach user if token present, but don't require
app.use('/jobs', jobsRouter);
app.use('/prefs', prefsRouter);
app.use('/channels', channelsRouter);
app.use('/scrape', scrapeRouter);
app.use('/settings', settingsRouter);
app.use('/admin', adminRouter);
app.use('/push', pushRouter);

// ---- Fallbacks -----------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// ---- Start ---------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? '4000', 10);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
  });
}

export default app;
