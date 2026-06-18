#!/usr/bin/env bash
# Codespaces setup — runs automatically on container creation.
# Run manually with: bash scripts/codespace-setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Creating .env from .env.example (if not exists)"
[ -f .env ] || cp .env.example .env

echo "==> Installing pnpm dependencies"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "==> Installing Puppeteer system dependencies"
sudo apt-get update -qq
# Package name changed in Ubuntu 24.04 (libasound2 -> libasound2t64); try both
sudo apt-get install -y -qq \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 \
  > /dev/null 2>&1 || true
sudo apt-get install -y -qq libasound2 > /dev/null 2>&1 || \
  sudo apt-get install -y -qq libasound2t64 > /dev/null 2>&1 || true

echo "==> Downloading Chromium for Puppeteer"
npx puppeteer browsers install chrome > /dev/null 2>&1 || echo "    (puppeteer chrome download skipped — will happen on first run)"

echo "==> Starting Postgres + Redis via docker compose"
docker compose up -d

echo "==> Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if pg_isready -h localhost -p 5432 -U tja > /dev/null 2>&1; then
    echo "    Postgres ready (after ${i}s)"
    break
  fi
  sleep 1
done

echo "==> Generating Prisma client"
pnpm db:generate

echo "==> Loading .env into shell"
set -a && source .env && set +a

echo "==> Running Prisma migrations (auto-generated) + FTS trigger"
DATABASE_URL="${DATABASE_URL}" DIRECT_URL="${DIRECT_URL}" pnpm db:migrate

echo "==> Seeding channels + AI provider configs from env"
pnpm db:seed || echo "    (seed partial — set AI API keys as Codespace secrets and re-run: pnpm db:seed)"

echo ""
echo "=================================================================="
echo "✅  Codespace ready!"
echo "=================================================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Set Codespace secrets (Codespace menu → Settings → Secrets):"
echo "     GEMINI_API_KEY          (get free key: https://aistudio.google.com/apikey)"
echo "     JWT_SECRET              (any 32+ char random string)"
echo "     VAPID_PUBLIC_KEY        (run: npx web-push generate-vapid-keys)"
echo "     VAPID_PRIVATE_KEY"
echo "     VAPID_SUBJECT           (mailto:you@example.com)"
echo "     NEXT_PUBLIC_VAPID_PUBLIC_KEY  (same value as VAPID_PUBLIC_KEY)"
echo ""
echo "2. After secrets are set, reload them and re-seed:"
echo "     pnpm db:seed"
echo ""
echo "3. Run the stack in 3 terminals (or use tmux):"
echo "     pnpm api       # Express backend on :4000"
echo "     pnpm worker    # BullMQ workers + 30-min cron"
echo "     pnpm web       # Next.js PWA on :3000  (auto-forwards publicly)"
echo ""
echo "4. Open the PWA:"
echo "     Click the 'Open in browser' link Codespace shows for port 3000,"
echo "     or run: gp ports list"
echo ""
echo "Tip: 'Codespace menu → Ports' shows live URLs for 3000 (web) and 4000 (api)."
