#!/usr/bin/env bash
# Test an AI provider key before adding it to .env
# Usage:
#   bash scripts/test-key.sh deepseek sk-...
#   bash scripts/test-key.sh mistral xxx...
#   bash scripts/test-key.sh openrouter sk-or-v1-...
#   bash scripts/test-key.sh kimi sk-...
set -euo pipefail

PROVIDER="${1:-}"
KEY="${2:-}"

if [ -z "$PROVIDER" ] || [ -z "$KEY" ]; then
  echo "Usage: bash scripts/test-key.sh <provider> <key>"
  echo ""
  echo "Providers: deepseek, mistral, openrouter, kimi"
  echo ""
  echo "Examples:"
  echo "  bash scripts/test-key.sh deepseek sk-abc123..."
  echo "  bash scripts/test-key.sh mistral abc123..."
  echo "  bash scripts/test-key.sh openrouter sk-or-v1-abc123..."
  exit 1
fi

echo "================================================================"
echo "  Testing $PROVIDER key"
echo "================================================================"
echo ""

case "$PROVIDER" in
  deepseek)
    URL="https://api.deepseek.com/v1/chat/completions"
    MODEL="deepseek-chat"
    AUTH="Authorization: Bearer $KEY"
    EXTRA=""
    ;;
  mistral)
    URL="https://api.mistral.ai/v1/chat/completions"
    MODEL="mistral-small-latest"
    AUTH="Authorization: Bearer $KEY"
    EXTRA=""
    ;;
  openrouter)
    URL="https://openrouter.ai/api/v1/chat/completions"
    MODEL="nvidia/nemotron-3-nano-30b-a3b:free"
    AUTH="Authorization: Bearer $KEY"
    EXTRA='-H "HTTP-Referer: https://tja.local" -H "X-Title: Telegram Job Aggregator"'
    ;;
  kimi)
    URL="https://api.moonshot.cn/v1/chat/completions"
    MODEL="moonshot-v1-8k"
    AUTH="Authorization: Bearer $KEY"
    EXTRA=""
    ;;
  *)
    echo "Unknown provider: $PROVIDER"
    echo "Valid: deepseek, mistral, openrouter, kimi"
    exit 1
    ;;
esac

echo "POST $URL"
echo "Model: $MODEL"
echo ""
echo "Response:"
# shellcheck disable=SC2086
curl -sS -X POST "$URL" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  $EXTRA \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with: {\\\"ok\\\": true}\"}],\"temperature\":0,\"max_tokens\":50}" | head -c 1000
echo ""
echo ""
echo "================================================================"
echo "Interpretation:"
echo "  - 200 + JSON with 'choices' → ✓ key works"
echo "  - 401 Unauthorized           → key is invalid or revoked"
echo "  - 403 Forbidden              → region-blocked (try DeepSeek instead)"
echo "  - 429 Too Many Requests      → quota exceeded, key works but rate-limited"
echo "================================================================"
