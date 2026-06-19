#!/usr/bin/env bash
# =============================================================================
# Telegram Job Aggregator — Quick Setup
# =============================================================================
# This script helps you set up the project with your preferred AI provider.
#
# Option 1 (RECOMMENDED): Ollama — LOCAL, UNLIMITED, NO API KEY NEEDED
#   Runs on your machine with zero rate limits. Needs ~2GB RAM for tiny models.
#
# Option 2: Mistral AI — 1 BILLION tokens/month free
#   Sign up at https://console.mistral.ai (phone verify, no credit card)
#
# Option 3: Groq — Fastest inference, 30 RPM free, no credit card
#   Sign up at https://console.groq.com
#
# DEFAULT: No AI key needed — rule-based extractor works 100% offline
# =============================================================================

set -e

echo "============================================"
echo " Telegram Job Aggregator — Setup"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Install from https://nodejs.org"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo ""
    echo "📝 Creating .env.local..."
    echo "# Using rule-based extractor (no AI key needed)" > .env.local
    echo "NODE_ENV=development" >> .env.local
    echo "   Created .env.local with defaults"
fi

# Offer Ollama setup
echo ""
echo "============================================"
echo "⚡ AI Provider Setup"
echo "============================================"
echo ""
echo "Do you want to set up Ollama (LOCAL, UNLIMITED AI)? (y/n)"
read -r SETUP_OLLAMA

if [ "$SETUP_OLLAMA" = "y" ] || [ "$SETUP_OLLAMA" = "Y" ]; then
    echo ""
    echo "🔧 Installing Ollama..."
    
    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -fsSL https://ollama.com/install.sh | sh
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        curl -fsSL https://ollama.com/install.sh | sh
    else
        echo "⚠️  Please install Ollama manually from https://ollama.com"
    fi
    
    echo "⏳ Pulling qwen2.5:0.5b (tiny, fast model)..."
    ollama pull qwen2.5:0.5b 2>/dev/null || true
    
    echo "✅ Ollama ready! Model: qwen2.5:0.5b"
    
    # Update .env.local
    cat > .env.local << 'EOF'
# Using Ollama (local, unlimited, no API key)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:0.5b
NODE_ENV=development
EOF
    echo "   Updated .env.local to use Ollama"
fi

echo ""
echo "============================================"
echo " ✅ Setup complete!"
echo ""
echo " Quick start:"
echo "   npm run dev     # Start dev server (http://localhost:3000)"
echo "   npm run build   # Production build"
echo ""
echo " Open http://localhost:3000/admin to scrape jobs"
echo "============================================"
