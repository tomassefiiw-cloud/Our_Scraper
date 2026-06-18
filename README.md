# EthioJob Hunter

> AI-powered job aggregator for 12 Ethiopian Telegram channels.
> **PWA-first, offline-capable, all data lives in your browser's SQLite (IndexedDB).**

## What this is

A Progressive Web App that:
1. Scrapes 12 Ethiopian Telegram job channels every time you tap "Sync" (via the public `t.me/s/<channel>` webview, server-side fetch to bypass CORS)
2. Uses LLMs (DeepSeek, Mistral, etc. — you bring the key) to extract structured job data from messy Amharic/English posts
3. Deduplicates across channels (3-layer: exact link → company+title Jaccard → semantic-ish)
4. Filters by your preferences (experience, location, categories, **exclude keywords**, etc.)
5. Stores everything in **SQLite running in your browser** via `sql.js` (WASM), persisted to IndexedDB
6. Works offline — once synced, the app opens and browses jobs with no network

**Why SQLite in the browser?**
- Zero ops (no database server, no Redis, no worker process)
- Privacy (your job data lives on your device, not on a server)
- Offline-first (browse saved jobs on the subway)
- Single deployment (one Vercel app, not 3 services)

## Architecture

```
┌─────────────────────────────────────────────┐
│  PWA (Next.js, runs in browser)             │
│  ┌─────────────────────────────────────┐    │
│  │ SQLite (sql.js WASM)                │    │
│  │  - jobs, raw_messages, prefs,       │    │
│  │    interactions                     │    │
│  │  - persisted to IndexedDB           │    │
│  └─────────────────────────────────────┘    │
│  - Feed / Filters / Settings / Admin        │
│  - All filtering + dedup happens locally    │
└──────────────────┬──────────────────────────┘
                   │ HTTPS (only when syncing)
                   ▼
┌─────────────────────────────────────────────┐
│  Next.js API Routes (serverless, same dep.) │
│  - /api/scrape/[channel]  → t.me/s/<chan>   │
│    (server-side, bypasses CORS)             │
│  - /api/extract            → AI extraction  │
│    (keys stay server-side, never exposed)   │
└─────────────────────────────────────────────┘
```

## Quick Start (GitHub Codespaces)

1. Go to https://github.com/tomassefiiw-cloud/Our_Scraper
2. **Code** → **Codespaces** → **Create codespace on main**
3. Wait for `postinstall` to copy `sql-wasm.wasm` into `/public`
4. Get a free **DeepSeek** API key at https://platform.deepseek.com (new users get $5.50 free credit — ~37K requests). Works globally, no region blocks.
5. In the codespace, create `.env`:
   ```bash
   bash scripts/setup-env.sh
   # Follow the prompts to paste your DeepSeek key
   ```
6. Run:
   ```bash
   npm run dev
   ```
7. Codespace shows a forwarded port `3000` — click the URL. The PWA opens.
8. Tap **Admin** → **Sync all 12 channels**. Wait ~10-15 min. Jobs appear.

## Quick Start (Local)

```bash
git clone https://github.com/tomassefiiw-cloud/Our_Scraper.git
cd Our_Scraper
npm install            # postinstall copies sql-wasm.wasm into /public
cp .env.example .env   # then edit .env to add at least GEMINI_API_KEY
npm run dev
# open http://localhost:3000
```

## Environment Variables

Only AI provider keys are needed (server-side only). Set at least one:

| Variable | Free tier | Notes |
|---|---|---|
| `DEEPSEEK_API_KEY` | **$5.50 free credit (~37K requests)** | **Recommended** — works globally, no region blocks. Get key at https://platform.deepseek.com |
| `MISTRAL_API_KEY` | Free tier (rate-limited, no daily cap) | Works globally. Get key at https://console.mistral.ai |
| `OPENROUTER_API_KEY` | 50 req/day on free tier | Aggregator — use only as backup. Get key at https://openrouter.ai |
| `KIMI_API_KEY` | varies | Chinese provider. Get key at https://platform.moonshot.cn |
| `OLLAMA_URL` + `OLLAMA_MODEL` | unlimited | Local fallback (requires running Ollama locally) |

**Why not Gemini / Groq / OpenAI / Claude?**
These providers are region-blocked in many areas (Ethiopia, etc.) — they return 403 Forbidden or quota=0 even with a valid key. DeepSeek and Mistral work globally and have generous free tiers.

The router tries providers in this order: DeepSeek → Mistral → OpenRouter → Kimi → Ollama. Providers that fail with hard errors (403/401/quota exhausted) are auto-disabled for the session via a circuit breaker.

## Channels (12)

| Channel | Type | Notes |
|---|---|---|
| elelanajobs | job_board | Multi-job messages |
| freelance_ethio | freelance_board | Afriwork, structured |
| geezjobs_ethiopia | recruiter | Full details in msg |
| harmeejobs | aggregator | Deep-link nightmare |
| Maroset | freelance_board | Easiest — no links |
| ethiojobs_official | aggregator | Hyperlinked "LINK" |
| ethio_job_vacancy1 | aggregator | Amharic headers |
| Ethiojobshubs | aggregator | Reposter, dedup heavy |
| hahujobs | job_board | Inline buttons |
| josad_it | curator | IT-focused |
| josad_software | curator | Software-focused |
| effoyjobs | job_board | Box-char markers |

Configs are in `lib/channels.ts`.

## How syncing works

1. PWA calls `GET /api/scrape/<channel>` → server fetches `t.me/s/<channel>`, parses HTML via Cheerio, returns raw messages
2. PWA stores raw messages in local SQLite (skip duplicates by UNIQUE constraint)
3. For each new raw message, PWA calls `POST /api/extract` with the message text + channel config
4. Server calls the AI provider (priority-ordered, failover) with the extraction prompt, returns structured jobs
5. PWA deduplicates against existing jobs in local SQLite (3 layers)
6. Non-duplicates are inserted — they show up in the feed immediately

**All AI keys stay server-side.** The browser only ever sees structured job JSON.

## File layout

```
.
├── app/
│   ├── api/
│   │   ├── scrape/[channel]/route.ts   # Telegram scraper (server-side)
│   │   ├── extract/route.ts            # AI extraction (server-side)
│   │   └── channels/route.ts           # Channel list
│   ├── jobs/[id]/page.tsx              # Job detail
│   ├── settings/page.tsx               # User preferences
│   ├── admin/page.tsx                  # Sync trigger + stats
│   ├── saved/page.tsx                  # Saved jobs
│   ├── layout.tsx
│   ├── page.tsx                        # Job feed
│   └── globals.css
├── components/
│   ├── Header.tsx
│   ├── JobCard.tsx
│   ├── JobFeed.tsx
│   └── SyncPanel.tsx
├── lib/
│   ├── ai-router.ts                    # 8-provider router
│   ├── channels.ts                     # 12 channel configs
│   ├── db.ts                           # sql.js + IndexedDB persistence
│   ├── dedup.ts                        # 3-layer dedup
│   ├── extractor.ts                    # Prompts + parsing
│   ├── filter.ts                       # User pref filter
│   ├── schema.ts                       # SQLite schema
│   ├── scraper.ts                      # Cheerio Telegram parser
│   └── sync.ts                         # Orchestration
├── public/
│   ├── icons/icon-192.png, icon-512.png
│   ├── manifest.json
│   ├── sw.js                           # Service worker
│   └── sql-wasm.wasm                   # SQLite WASM (copied by postinstall)
├── scripts/
│   └── copy-sql-wasm.mjs               # postinstall script
├── .env.example
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Deploy to Vercel

1. Push to GitHub
2. Import the repo at https://vercel.com/new
3. Set environment variables (at least `DEEPSEEK_API_KEY`)
4. Deploy — Vercel auto-detects Next.js, runs `npm install` (which triggers `postinstall` to copy `sql-wasm.wasm`), then `npm run build`
5. Visit the deployed URL — open the PWA, sync, install to home screen

## Privacy

- **All job data lives in your browser's IndexedDB.** Nothing is sent to a server unless you tap "Sync".
- **AI provider keys are server-side only** — the browser never sees them.
- **No telemetry, no analytics, no tracking.**
- Clearing your browser data wipes everything (or use Settings → "Clear all local data").

## License

MIT
