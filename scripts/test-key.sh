#!/usr/bin/env bash
# Test an AI provider key before adding it to .env
# Usage:
#   bash scripts/test-key.sh openrouter sk-or-v1-...
#   bash scripts/test-key.sh deepseek sk-...
#   bash scripts/test-key.sh groq gsk_...
#   bash scripts/test-key.sh gemini AIza...
set -euo pipefail

PROVIDER="${1:-}"
KEY="${2:-}"

if [ -z "$PROVIDER" ] || [ -z "$KEY" ]; then
  echo "Usage: bash scripts/test-key.sh <provider> <key>"
  echo ""
  echo "Providers: openrouter, deepseek, groq, gemini, openai, claude"
  echo ""
  echo "Examples:"
  echo "  bash scripts/test-key.sh openrouter sk-or-v1-abc123..."
  echo "  bash scripts/test-key.sh deepseek sk-abc123..."
  echo "  bash scripts/test-key.sh groq gsk_abc123..."
  exit 1
fi

echo "================================================================"
echo "  Testing $PROVIDER key"
echo "================================================================"
echo ""

case "$PROVIDER" in
  openrouter)
    URL="https://openrouter.ai/api/v1/chat/completions"
    MODEL="nvidia/nemotron-3-nano-30b-a3b:free"
    AUTH="Authorization: Bearer $KEY"
    EXTRA='-H "HTTP-Referer: https://tja.local" -H "X-Title: Telegram Job Aggregator"'
    ;;
  deepseek)
    URL="https://api.deepseek.com/v1/chat/completions"
    MODEL="deepseek-chat"
    AUTH="Authorization: Bearer $KEY"
    EXTRA=""
    ;;
  groq)
    URL="https://api.groq.com/openai/v1/chat/completions"
    MODEL="llama-3.1-8b-instant"
    AUTH="Authorization: Bearer $KEY"
    EXTRA=""
    ;;
  gemini)
    echo "Testing Gemini listModels (lighter auth check)..."
    curl -sS "https://generativelanguage.googleapis.com/v1beta/models?key=$KEY" | head -c 800
    echo ""
    echo ""
    echo "Testing Gemini generateContent..."
    curl -sS -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$KEY" \
      -H "Content-Type: application/json" \
      -d '{"contents":[{"parts":[{"text":"Say hello"}]}]}' | head -c 800
    exit 0
    ;;
  openai)
    URL="https://api.openai.com/v1/chat/completions"
    MODEL="gpt-3.5-turbo"
    AUTH="Authorization: Bearer $KEY"
    EXTRA=""
    ;;
  claude)
    echo "Testing Claude..."
    curl -sS -X POST "https://api.anthropic.com/v1/messages" \
      -H "x-api-key: $KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "Content-Type: application/json" \
      -d '{"model":"claude-3-haiku-20240307","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}' | head -c 800
    exit 0
    ;;
  *)
    echo "Unknown provider: $PROVIDER"
    echo "Valid: openrouter, deepseek, groq, gemini, openai, claude"
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
echo "  - 403 Forbidden              → region-blocked (try OpenRouter instead)"
echo "  - 429 Too Many Requests      → quota exceeded, key works but rate-limited"
echo "================================================================"
