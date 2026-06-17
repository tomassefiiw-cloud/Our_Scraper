# Telegram Job Aggregator

> AI-assisted job scraping, extraction & filtering webapp with PWA.
> Aggregates 12 Ethiopian Telegram job channels every 30 minutes, uses LLMs to
> extract structured data from messy Amharic/English posts, follows deep links
> to company career pages, deduplicates across channels, filters by per-user
> preferences, and pushes notifications.

**Status:** Phase 2 (Core Features) — all 12 channels wired, multi-provider AI
router with failover, deep-link extraction (L1–L4), auth, preferences,
deduplication, PWA shell, push notifications setup, admin dashboard.

---

## Table of Contents

- [Architecture](#architecture)
- [Monorepo Layout](#monorepo-layout)
- [Quick Start (Local)](#quick-start-local)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [AI Provider Setup](#ai-provider-setup)
- [Running the Stack](#running-the-stack)
- [Channels](#channels)
- [The Scrape Pipeline](#the-scrape-pipeline)
- [API Reference](#api-reference)
- [PWA & Push Notifications](#pwa--push-notifications)
- [Deployment](#deployment)
- [Roadmap](#roadmap)

---

## Architecture

```
FRONTEND (Next.js 14 PWA)        BACKEND (Express + Worker)
  Job Feed (Infinite Scroll)       API Layer (/jobs, /auth, /prefs, /admin, ...)
  Filters                          Scraper Engine (Cheerio)
  Settings                         AI Extractor (Multi-provider router)
  Push Notifications               Deep Link Navigator (Puppeteer)
        │                          Deduplicator (3-layer)
        │                          Filter Engine
        │                                │
        └──── HTTPS ──────► ┌────────────┴────────────┐
                             │   BullMQ Queues + Redis  │
                             │   - scrape  - extract    │
                             │   - deeplink - notify    │
                             └────────────┬────────────┘
                                          │
                            ┌─────────────┴─────────────┐
                            │   PostgreSQL (Prisma)      │
                            │   users, jobs, channels,   │
                            │   raw_messages, scrape_logs│
                            └────────────────────────────┘
```

For full design rationale see `docs/architecture.md` (the original spec).

---

## Monorepo Layout

```
.
├── apps/
│   ├── web/                  # Next.js 14 PWA (App Router, Tailwind, SW)
│   ├── api/                  # Express backend (all routes from §3)
│   └── worker/               # BullMQ workers + 30-min cron
├── packages/
│   ├── shared/               # Types + 12 channel configs + constants
│   ├── db/                   # Prisma schema (mirrors §5 SQL) + seed
│   ├── scraper/              # TelegramScraper + DeepLinkNavigator + 10 strategies
│   ├── ai-router/            # 8 AI providers + priority router + extractor + prompts
│   ├── dedup/                # 3-layer deduplication engine
│   └── filter/               # User preference filter engine
├── docker-compose.yml        # Local Postgres + Redis
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Quick Start (Local)

**Prereqs:** Node 20+, pnpm 9+, Docker (or running Postgres + Redis).

```bash
# 1. Clone + install
git clone https://github.com/tomassefiiw-cloud/Our_Scraper.git
cd Our_Scraper
pnpm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, REDIS_URL, JWT_SECRET,
# and at least ONE AI provider key (GEMINI_API_KEY recommended for free tier).

# 4. Generate Prisma client + run migrations + seed channels
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. Run the stack (in 3 terminals, or use tmux)
pnpm api       # Express API on :4000
pnpm worker    # BullMQ workers + cron
pnpm web       # Next.js PWA on :3000
```

Open `http://localhost:3000`. The first scrape runs immediately on worker
startup via the cron scheduler; you can also trigger one manually from the
admin dashboard at `/admin` (log in with `displayName: "Admin"`).

---

## Environment Variables

See `.env.example` for the full list. The minimum to get a working pipeline:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DIRECT_URL` | Same as above (used for Prisma migrations) |
| `REDIS_URL` | Redis connection for BullMQ |
| `JWT_SECRET` | Secret for signing auth tokens |
| `GEMINI_API_KEY` | At least one AI provider key (Gemini free tier recommended) |
| `NEXT_PUBLIC_API_URL` | Backend URL for the PWA (default `http://localhost:4000`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Generate with `npx web-push generate-vapid-keys` |
| `SCRAPE_INTERVAL_MINUTES` | Cron interval (default `30`) |

---

## Database

PostgreSQL schema is defined in `packages/db/prisma/schema.prisma` — it mirrors
the §5 SQL spec exactly (users, user_preferences, channels, raw_messages,
jobs, duplicate_groups, user_job_interactions, ai_provider_configs,
scrape_logs, notification_logs, push_subscriptions).

A custom migration adds **full-text search** via a `TSVECTOR` column + trigger
(`packages/db/prisma/migrations/20260617000000_init/migration.sql`) — this lets
the `/jobs?q=...` endpoint use `tsvector` search out of the box.

```bash
pnpm db:migrate     # apply migrations
pnpm db:seed        # seed 12 channels + AI provider configs from env
pnpm --filter @tja/db run studio   # prisma studio GUI
```

---

## AI Provider Setup

The system supports 8 providers with priority-ordered failover (doc §7.2):

| Provider | Env var | Free tier | Notes |
|---|---|---|---|
| Gemini | `GEMINI_API_KEY` | 15 RPM, 1500/day | Best free tier — recommended primary |
| DeepSeek | `DEEPSEEK_API_KEY` | 10 RPM, 10K tok/day | Good for structured output |
| Groq | `GROQ_API_KEY` | 20 RPM, 14400/day | Fastest, generous |
| OpenRouter | `OPENROUTER_API_KEY` | varies | Aggregator, good fallback |
| Claude | `CLAUDE_API_KEY` | 5 RPM, 100/day | Very restrictive |
| OpenAI | `OPENAI_API_KEY` | 3 RPM, 200/day | Last resort |
| Kimi | `KIMI_API_KEY` | 10 RPM, 1000/day | |
| Ollama | `OLLAMA_URL` | unlimited | Local fallback (Phi-4 / Qwen 2.5) |

Set as many as you have. The seed script auto-creates system-level provider
configs from env (priority order = order listed above). Per-user configs can be
added via the `/settings/ai-providers` API.

**Multi-key load balancing** (doc §7.3): add multiple configs for the same
provider with different priorities — the router round-robins across them.

---

## Running the Stack

```bash
# API (port 4000)
pnpm api

# Worker (BullMQ + cron — runs forever)
pnpm worker

# Web (port 3000)
pnpm web

# One-off scrape (no worker needed)
pnpm scrape:once                      # all channels
pnpm scrape:once -- elelanajobs       # single channel
```

---

## Channels

All 12 channels from the spec are pre-configured in `packages/shared/src/channels.ts`:

| Channel | Type | Deep-link strategy | Notes |
|---|---|---|---|
| elelanajobs | job_board | direct_job_page | Multi-job messages |
| freelance_ethio | freelance_board | direct_job_page | Afriwork, structured |
| geezjobs_ethiopia | recruiter | direct_job_page | Full details in msg |
| harmeejobs | aggregator | company_page_to_jobs | Deep-link nightmare |
| Maroset | freelance_board | none | Easiest — no links |
| ethiojobs_official | aggregator | stack_navigation | Hyperlinked "LINK" |
| ethio_job_vacancy1 | aggregator | direct_job_page | Amharic headers |
| Ethiojobshubs | aggregator | direct_job_page | Reposter, dedup heavy |
| hahujobs | job_board | dynamic_spa | Inline buttons |
| josad_it | curator | curator_redirect | IT-focused |
| josad_software | curator | curator_redirect | Software-focused |
| effoyjobs | job_board | job_board_page | Box-char markers |

**To add a new channel** (doc §16): visit `t.me/s/<channel>`, study 100
recent messages, then add an entry to `CHANNEL_CONFIGS` with all required
fields. Run `pnpm db:seed` to upsert it into the DB.

---

## The Scrape Pipeline

Implemented in `apps/worker/src/pipeline.ts` (doc §8.1):

1. **Cron tick** (every 30 min) enqueues a scrape job per active channel.
2. **Scrape** — Cheerio fetches `t.me/s/<channel>`, parses `.tgme_widget_message` elements, extracts text/HTML/links/views/datetime.
3. **Filter** — skip messages older than `lookbackHours` or matching `skipPatterns`.
4. **Persist** — insert as `raw_messages` (skip duplicates by unique `(channel_id, telegram_msg_id)`).
5. **AI Extract** — for each pending raw message, send to AIExtractor with the channel-specific prompt.
6. **Deep Link** — if `deepLinkFollow != 'none'` and links present, DeepLinkNavigator runs Puppeteer with the domain-specific strategy; results merged with telegram-extracted data.
7. **Deduplicate** — 3 layers: exact link → company+title Jaccard (>0.85) → semantic-ish Jaccard (>0.92). Same-company-different-title = NOT dup. Reposts after 7 days = NOT dup.
8. **Persist jobs** — non-duplicates inserted with `extraction_method` ∈ `telegram_only | deep_link | deep_link_failed_fallback`.
9. **Match users** — FilterEngine checks each fresh job against every active user's preferences; matches enqueue `notify` jobs.
10. **Notify** — notify worker sends web push to all of the user's `push_subscriptions`.

---

## API Reference

Base URL: `http://localhost:4000` (PWA proxies via `/api/*`).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/health` | – | Health check (also keeps Render alive) |
| POST | `/auth/signup` | – | Create account |
| POST | `/auth/login` | – | Login, returns JWT |
| GET  | `/auth/me` | user | Current user info |
| GET  | `/jobs` | optional | Paginated feed (cursor infinite scroll) |
| GET  | `/jobs/:id` | user | Job detail (records a 'viewed' interaction) |
| POST | `/jobs/:id/interact` | user | Record action: saved/hidden/applied/dismissed |
| GET  | `/jobs/saved/all` | user | User's saved jobs |
| GET  | `/prefs` | user | Get preferences |
| PUT  | `/prefs` | user | Update preferences |
| GET  | `/channels` | user | List channels |
| PATCH| `/channels/:id` | admin | Update channel config |
| POST | `/scrape/trigger` | admin | Trigger immediate scrape (optional `?channel=`) |
| GET  | `/scrape/logs` | admin | Recent scrape logs |
| GET  | `/settings/ai-providers` | user | List AI provider configs (keys masked) |
| POST | `/settings/ai-providers` | user | Add provider config |
| PATCH| `/settings/ai-providers/:id` | user | Update provider config |
| DELETE| `/settings/ai-providers/:id` | user | Remove provider config |
| GET  | `/admin/stats` | admin | System stats (totals, extraction method breakdown) |
| GET  | `/admin/jobs/recent` | admin | Recently scraped jobs |
| GET  | `/admin/channels/health` | admin | Per-channel health |
| POST | `/push/subscribe` | user | Register a VAPID push subscription |
| POST | `/push/unsubscribe` | user | Remove a push subscription |

---

## PWA & Push Notifications

- `apps/web/public/manifest.json` — PWA manifest (installable, standalone display).
- `apps/web/public/sw.js` — Service worker: handles push events, notification clicks, offline caching.
- `next.config.mjs` — Optionally uses `next-pwa` for runtime caching if installed; falls back to manual SW otherwise.
- Settings page (`/settings`) has an "Enable notifications" button that subscribes the device via VAPID.

To enable push:
```bash
npx web-push generate-vapid-keys
# Copy public + private keys into .env:
#   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
#   NEXT_PUBLIC_VAPID_PUBLIC_KEY (for the web client)
```

---

## Deployment

**Free-tier-friendly** (doc §14.1):

- **Frontend (web):** Vercel — one-click Next.js deploy, automatic HTTPS (required for push).
- **Backend (api):** Render or Railway — set `PORT` env, add health-check ping (cron-job.org pinging `/health` every 10 min keeps Render from sleeping).
- **Worker:** Render background worker — runs forever, holds the cron.
- **DB:** Supabase (500MB free, built-in auth available).
- **Redis:** Upstash (30MB free, serverless REST API).

Production `.env` checklist:
- [ ] `DATABASE_URL` — Supabase pooler URL
- [ ] `DIRECT_URL` — Supabase direct URL (for migrations)
- [ ] `REDIS_URL` — Upstash Redis URL
- [ ] `JWT_SECRET` — 32+ char random string
- [ ] At least one AI provider key
- [ ] `VAPID_*` keys generated
- [ ] `NEXT_PUBLIC_API_URL` — your deployed API URL
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — same as `VAPID_PUBLIC_KEY`

---

## Roadmap

Phase 2 (this repo) is complete. Phase 3/4 from the spec:

- [ ] Real semantic deduplication (use embedding API instead of Jaccard)
- [ ] Anti-bot evasion (proxy rotation, residential IPs)
- [ ] Salary extraction improvements
- [ ] Job application tracking dashboard
- [ ] CSV/Excel export
- [ ] Capacitor mobile wrapper around the PWA

---

## Documentation

- `docs/architecture.md` — the original spec (1791 lines), the source of truth.
- Inline code comments reference section numbers like `(doc §6.1)` for traceability.

---

## License

MIT — see `LICENSE` (to be added).
