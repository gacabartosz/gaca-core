# G.A.C.A. — Generative AI Arbitrage Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/gacabartosz/gaca-core/pulls)

> Universal AI Bus with automatic failover, performance ranking, rate limiting, and **50+ free LLM models** from 11 providers.

**G.A.C.A.** (Generative AI Completion Architecture) acts as a smart proxy between your application and multiple AI providers. It automatically selects the best available model, handles rate limits, tracks performance, and fails over to alternative providers — all transparently.

## Key Features

- **11 AI Providers** — Groq, Cerebras, Google AI, OpenRouter, Mistral, HuggingFace, Together AI, Fireworks AI, DeepSeek, Anthropic, OpenAI
- **50+ Models** — Including 36+ completely free models
- **Automatic Failover** — Up to 30 fallback attempts when a provider fails
- **Performance Ranking** — Auto-calculated scores based on success rate, latency, and quality
- **Rate Limit Tracking** — Per-provider AND per-model RPM/RPD tracking with in-memory cache
- **Auto-Update** — Automatically syncs new models/providers from code updates without losing data
- **Cost Tracking** — Token usage and USD cost estimation per request
- **Admin Dashboard** — React UI for managing providers, models, rankings, and testing
- **REST API** — Full CRUD for all entities plus AI completion endpoint
- **Prompt Templates** — Editable system prompts with variable substitution

## Architecture

```
Your App ──► POST /api/complete ──► AIEngine
                                      │
                                      ▼
                                 ModelSelector ──► RankingService
                                      │               │
                                      ▼               │
                                 GenericAdapter ◄─────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                  ▼
              ┌──────────┐    ┌──────────┐      ┌──────────┐
              │   Groq   │    │ Cerebras │ ...  │ Mistral  │
              │  (FREE)  │    │  (FREE)  │      │  (FREE)  │
              └──────────┘    └──────────┘      └──────────┘
```

## Quick Start (5 minutes)

```bash
# 1. Clone
git clone https://github.com/gacabartosz/gaca-core.git
cd gaca-core

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env — add your free API keys (see step-by-step guide below)

# 4. Initialize database
npx prisma generate
npx prisma db push
npm run seed:force

# 5. Start
npm run dev
# Server: http://localhost:3002
# Dashboard: http://localhost:5173
```

---

## Getting API Keys — Step-by-Step Guide

All free providers require **no credit card**. You can set up all 8 free providers in about 10 minutes.

### Groq (FREE — 30 RPM, 14,400 RPD)

**Models:** Llama 3.3 70B, Llama 3.1 8B, Llama 4 Maverick/Scout, Qwen 3 32B, Kimi K2, GPT-OSS 120B/20B

1. Go to [console.groq.com](https://console.groq.com)
2. Click **"Sign Up"** — use Google or GitHub (no credit card needed)
3. In the left sidebar, click **"API Keys"**
4. Click **"Create API Key"**, give it a name (e.g. "gaca")
5. Copy the key (starts with `gsk_...`)
6. Paste into your `.env` file:
   ```
   GROQ_API_KEY=gsk_your_key_here
   ```

### Cerebras (FREE — 30 RPM, 14,400 RPD)

**Models:** Llama 3.1 8B, Qwen 3 235B, GPT-OSS 120B, ZAI GLM 4.7

1. Go to [cloud.cerebras.ai](https://cloud.cerebras.ai/)
2. Click **"Sign Up"** — use Google or email
3. After login, click your avatar → **"API Keys"** in the dropdown
4. Click **"Create API Key"**
5. Copy the key (starts with `csk-...`)
6. Paste into your `.env` file:
   ```
   CEREBRAS_API_KEY=csk-your_key_here
   ```

### Google AI Studio (FREE — 30 RPM, 14,400 RPD)

**Models:** Gemini 2.0 Flash, Gemini 2.5 Flash Lite, Gemma 3 (27B, 12B, 4B, 1B)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **"Create API key"**
4. Select a Google Cloud project (or create a new one — it's free)
5. Copy the key (starts with `AIza...`)
6. Paste into your `.env` file:
   ```
   GOOGLE_AI_API_KEY=AIzaSy_your_key_here
   ```

### OpenRouter (FREE — 20 RPM, 50 RPD on free models)

**Models:** Llama 3.3 70B, DeepSeek R1, Gemma 3, Kimi K2, GPT-OSS (all `:free` suffix)

1. Go to [openrouter.ai](https://openrouter.ai/)
2. Click **"Sign Up"** — use Google, GitHub, or email
3. After login, click your avatar → **"Keys"**
4. Click **"Create Key"**, give it a name
5. Copy the key (starts with `sk-or-...`)
6. Paste into your `.env` file:
   ```
   OPENROUTER_API_KEY=sk-or-your_key_here
   ```

> **Note:** Free models on OpenRouter have `:free` suffix (e.g. `meta-llama/llama-3.3-70b-instruct:free`). GACA handles this automatically.

### Mistral AI (FREE — 1 RPM, 500 RPD)

**Models:** Mistral Small, Mistral Nemo, Codestral

1. Go to [console.mistral.ai](https://console.mistral.ai/)
2. Click **"Sign Up"** — use email or GitHub
3. After login, click **"API Keys"** in the left sidebar
4. Click **"Create new key"**
5. Copy the key
6. Paste into your `.env` file:
   ```
   MISTRAL_API_KEY=your_key_here
   ```

### HuggingFace (FREE — Inference API)

**Models:** Llama 3.3 70B, Mixtral 8x7B, Qwen 2.5 72B

1. Go to [huggingface.co](https://huggingface.co/)
2. Click **"Sign Up"** — use email, Google, or GitHub
3. Click your avatar → **"Settings"**
4. In the left sidebar, click **"Access Tokens"**
5. Click **"New token"**, select **"Read"** permission, give it a name
6. Copy the token (starts with `hf_...`)
7. Paste into your `.env` file:
   ```
   HUGGINGFACE_API_KEY=hf_your_token_here
   ```

### Together AI (FREE — $25 credits, 60 RPM)

**Models:** Llama 3.3 70B Turbo, Qwen 2.5 Coder 32B, DeepSeek R1

1. Go to [api.together.xyz](https://api.together.xyz/)
2. Click **"Sign Up"** — use Google, GitHub, or email
3. You'll get **$25 free credits** (enough for thousands of requests)
4. Click your avatar → **"Settings"** → **"API Keys"**
5. Copy the existing key or create a new one
6. Paste into your `.env` file:
   ```
   TOGETHER_API_KEY=your_key_here
   ```

### Fireworks AI (FREE tier — 20 RPM)

**Models:** Llama 3.3 70B, Qwen 3 235B

1. Go to [fireworks.ai](https://fireworks.ai/)
2. Click **"Sign Up"** — use Google, GitHub, or email
3. After login, click your avatar → **"API Keys"**
4. Click **"Create API Key"**
5. Copy the key (starts with `fw_...`)
6. Paste into your `.env` file:
   ```
   FIREWORKS_API_KEY=fw_your_key_here
   ```

### DeepSeek (BUDGET — $0.0001/1K input tokens)

**Models:** DeepSeek Chat, DeepSeek Coder, DeepSeek Reasoner

1. Go to [platform.deepseek.com](https://platform.deepseek.com/)
2. Click **"Sign Up"** — use email
3. Add credits (minimum $1 — lasts thousands of requests)
4. Click **"API Keys"** in the left sidebar
5. Click **"Create new secret key"**
6. Copy the key (starts with `sk-...`)
7. Paste into your `.env` file:
   ```
   DEEPSEEK_API_KEY=sk-your_key_here
   ```

### Anthropic (PAID)

**Models:** Claude Sonnet 4, Claude Opus 4, Claude 3.5 Haiku

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Click **"Sign Up"** — use email or Google
3. Add a payment method in **"Billing"**
4. Click **"API Keys"** in the left sidebar
5. Click **"Create Key"**
6. Copy the key (starts with `sk-ant-...`)
7. Paste into your `.env` file:
   ```
   ANTHROPIC_API_KEY=sk-ant-your_key_here
   ```

### OpenAI (PAID)

**Models:** GPT-4o, GPT-4o Mini, O1, O3 Mini

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Click **"Sign Up"** — use email, Google, or Microsoft
3. Add a payment method in **"Billing"**
4. Click **"API Keys"** in the left sidebar
5. Click **"Create new secret key"**
6. Copy the key (starts with `sk-...`)
7. Paste into your `.env` file:
   ```
   OPENAI_API_KEY=sk-your_key_here
   ```

---

## Available Free Models (36+)

<details>
<summary>Click to expand full model list</summary>

### Groq (8 models)
| Model | Display Name | RPD |
|-------|-------------|-----|
| `llama-3.1-8b-instant` | Llama 3.1 8B | 14,400 |
| `llama-3.3-70b-versatile` | Llama 3.3 70B | 1,000 |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | Llama 4 Maverick 17B | 1,000 |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Llama 4 Scout 17B | 1,000 |
| `qwen/qwen3-32b` | Qwen 3 32B | 1,000 |
| `moonshotai/kimi-k2-instruct` | Kimi K2 | 1,000 |
| `openai/gpt-oss-120b` | GPT-OSS 120B | 1,000 |
| `openai/gpt-oss-20b` | GPT-OSS 20B | 1,000 |

### Cerebras (4 models)
| Model | Display Name | RPD |
|-------|-------------|-----|
| `llama3.1-8b` | Llama 3.1 8B | 14,400 |
| `qwen-3-235b-a22b-instruct-2507` | Qwen 3 235B | 14,400 |
| `gpt-oss-120b` | GPT-OSS 120B | 14,400 |
| `zai-glm-4.7` | ZAI GLM 4.7 | 14,400 |

### Google AI Studio (6 models)
| Model | Display Name | RPD |
|-------|-------------|-----|
| `gemma-3-27b-it` | Gemma 3 27B | 14,400 |
| `gemma-3-12b-it` | Gemma 3 12B | 14,400 |
| `gemma-3-4b-it` | Gemma 3 4B | 14,400 |
| `gemma-3-1b-it` | Gemma 3 1B | 14,400 |
| `gemini-2.0-flash` | Gemini 2.0 Flash | 1,500 |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite | 1,500 |

### OpenRouter (10 free models)
| Model | Display Name |
|-------|-------------|
| `meta-llama/llama-3.3-70b-instruct:free` | Llama 3.3 70B |
| `google/gemma-3-27b-it:free` | Gemma 3 27B |
| `google/gemma-3-12b-it:free` | Gemma 3 12B |
| `deepseek/deepseek-r1-0528:free` | DeepSeek R1 |
| `qwen/qwen3-4b:free` | Qwen 3 4B |
| `qwen/qwen3-coder:free` | Qwen 3 Coder |
| `mistralai/mistral-small-3.1-24b-instruct:free` | Mistral Small 3.1 |
| `moonshotai/kimi-k2:free` | Kimi K2 |
| `openai/gpt-oss-120b:free` | GPT-OSS 120B |
| `openai/gpt-oss-20b:free` | GPT-OSS 20B |

### Mistral AI (3 models)
| Model | Display Name |
|-------|-------------|
| `mistral-small-latest` | Mistral Small |
| `open-mistral-nemo` | Mistral Nemo |
| `codestral-latest` | Codestral |

### HuggingFace (3 models)
| Model | Display Name |
|-------|-------------|
| `meta-llama/Llama-3.3-70B-Instruct` | Llama 3.3 70B |
| `mistralai/Mixtral-8x7B-Instruct-v0.1` | Mixtral 8x7B |
| `Qwen/Qwen2.5-72B-Instruct` | Qwen 2.5 72B |

### Together AI (3 models)
| Model | Display Name |
|-------|-------------|
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Llama 3.3 70B Turbo |
| `Qwen/Qwen2.5-Coder-32B-Instruct` | Qwen 2.5 Coder 32B |
| `deepseek-ai/DeepSeek-R1` | DeepSeek R1 |

### Fireworks AI (2 models)
| Model | Display Name |
|-------|-------------|
| `accounts/fireworks/models/llama-v3p3-70b-instruct` | Llama 3.3 70B |
| `accounts/fireworks/models/qwen3-235b-a22b` | Qwen 3 235B |

</details>

## API Reference

### AI Completion

```bash
# Auto-select best model
curl -X POST http://localhost:3002/api/complete \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Explain quantum computing in one sentence"}'

# With specific provider
curl -X POST http://localhost:3002/api/complete \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Hello", "providerId": "...", "temperature": 0.7, "maxTokens": 500}'

# Response:
# {
#   "content": "...",
#   "model": "llama-3.1-8b-instant",
#   "providerName": "Groq",
#   "tokensUsed": 42,
#   "latencyMs": 286,
#   "finishReason": "stop"
# }
```

### Available Models

```bash
curl http://localhost:3002/api/complete/available
```

### Health Check

```bash
curl http://localhost:3002/health
# {"status":"ok","providers":6,"models":51,"version":"1.0.0"}
```

### Providers CRUD

```bash
GET    /api/providers              # List all providers
GET    /api/providers/:id          # Get provider details
POST   /api/providers              # Create provider
PUT    /api/providers/:id          # Update provider
DELETE /api/providers/:id          # Delete provider
POST   /api/providers/:id/test     # Test provider connection
GET    /api/providers/stats/usage  # Usage statistics
```

### Models CRUD

```bash
GET    /api/models                 # List models (filter: ?providerId=...)
GET    /api/models/:id             # Get model details
POST   /api/models                 # Create model
PUT    /api/models/:id             # Update model
DELETE /api/models/:id             # Delete model
```

### Ranking

```bash
GET    /api/ranking                # Get all rankings
GET    /api/ranking/:modelId       # Get model ranking
POST   /api/ranking/recalculate    # Recalculate all rankings
PUT    /api/ranking/:modelId/quality # Update quality score
GET    /api/ranking/config/weights # Get ranking weights
PUT    /api/ranking/config/weights # Update ranking weights
```

### Prompts

```bash
GET    /api/prompts                # List all prompts
GET    /api/prompts/:name          # Get prompt content
POST   /api/prompts                # Create custom prompt
PUT    /api/prompts/:name          # Update prompt
DELETE /api/prompts/:name          # Delete prompt
```

### Admin

```bash
POST   /api/admin/sync-providers   # Trigger provider sync from code
GET    /api/admin/sync-status      # Last sync result
GET    /api/admin/default-providers # List providers defined in code
```

## Auto-Update System

G.A.C.A. includes a smart auto-update mechanism that keeps your models in sync:

### How It Works

1. **Source of truth** = `DEFAULT_PROVIDERS` array in `src/core/types.ts`
2. **Database** stores runtime state (API keys, usage stats, rankings)
3. **Sync script** compares code vs database and applies non-destructive changes:
   - New providers/models → created automatically
   - Removed models → disabled (not deleted, preserves history)
   - Config changes (URLs, rate limits) → updated
   - **Never touches**: API keys, usage data, rankings, enabled/disabled state

### Manual Sync

```bash
# Preview changes without applying
npm run sync:dry

# Apply changes
npm run sync
```

### Automatic Sync (Git-based)

```bash
# Run once — checks git, pulls, syncs, restarts
npm run auto-update

# Set up cron (every 6 hours)
crontab -e
# Add: 0 */6 * * * /path/to/gaca-core/scripts/auto-update.sh --cron >> /path/to/gaca-core/logs/auto-update.log 2>&1
```

### API Trigger

```bash
# Trigger sync via API
curl -X POST http://localhost:3002/api/admin/sync-providers

# Check last sync result
curl http://localhost:3002/api/admin/sync-status
```

## Ranking System

Models are ranked automatically based on three metrics:

```
score = successRate * 0.4 + (1 - normalizedLatency) * 0.3 + qualityScore * 0.3
```

| Metric | Weight | Description |
|--------|--------|-------------|
| Success Rate | 40% | Percentage of successful completions (0.0-1.0) |
| Latency | 30% | Response time, normalized to 0-10000ms |
| Quality | 30% | Manual quality score (default 0.5, adjustable via API) |

Rankings are recalculated automatically every 100 requests per model.

## Failover Logic

When a provider fails, G.A.C.A. automatically tries the next best model:

1. ModelSelector filters models by: API key exists, rate limits not exceeded
2. Models sorted by ranking score (highest first)
3. Default models get priority; provider priority used as tiebreaker
4. Up to 30 failover attempts per request
5. Failover events logged to database for analytics

Failover reasons: `rate_limit`, `timeout`, `error`, `quota_exceeded`, `model_not_found`

## Project Structure

```
gaca-core/
├── src/
│   ├── api/
│   │   ├── server.ts              # Express server + admin endpoints
│   │   └── routes/                # REST API routes
│   ├── core/
│   │   ├── AIEngine.ts            # Main completion engine
│   │   ├── GenericAdapter.ts      # Universal provider adapter
│   │   ├── ModelSelector.ts       # Model selection logic
│   │   ├── RankingService.ts      # Performance ranking
│   │   ├── UsageTracker.ts        # Rate limit tracking
│   │   └── types.ts               # Types + DEFAULT_PROVIDERS
│   ├── frontend/                  # React admin dashboard
│   └── prompts/                   # Prompt templates
├── prisma/
│   └── schema.prisma              # Database schema (SQLite)
├── scripts/
│   ├── seed.ts                    # Database seeding
│   ├── sync-providers.ts          # Smart provider sync
│   ├── auto-update.sh             # Git-based auto-update
│   └── test-providers.ts          # Provider testing
└── examples/                      # Usage examples
```

## Integration

### As a REST API

```javascript
// From any language/framework
const response = await fetch('http://localhost:3002/api/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Your prompt here',
    systemPrompt: 'You are a helpful assistant',
    temperature: 0.7,
    maxTokens: 1000,
  }),
});
const data = await response.json();
console.log(data.content);
```

### As a TypeScript Library

```typescript
import { AIEngine } from 'gaca-core';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const engine = new AIEngine(prisma);

const response = await engine.complete({
  prompt: 'Explain AI in simple terms',
  maxTokens: 200,
});

console.log(response.content);
console.log(`Provider: ${response.providerName}, Model: ${response.model}`);
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server + frontend dev mode |
| `npm run dev:server` | Start API server only (with watch) |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run seed` | Seed database (interactive) |
| `npm run seed:force` | Seed database (non-interactive, clears existing) |
| `npm run sync` | Sync providers from code to database |
| `npm run sync:dry` | Preview sync changes without applying |
| `npm run auto-update` | Check git for updates, sync, restart |
| `npm run test:providers` | Test all configured providers |
| `npm run db:studio` | Open Prisma Studio (DB GUI) |
| `npm run db:push` | Push schema changes to database |

## Tech Stack

- **Runtime**: Node.js 18+ / TypeScript 5.7
- **API**: Express.js 4
- **Database**: SQLite via Prisma ORM
- **Frontend**: React 19 + Vite 6 + Tailwind CSS
- **AI Protocols**: OpenAI-compatible, Google AI, Anthropic, Custom

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License — [Bartosz Gaca](https://github.com/gacabartosz)
