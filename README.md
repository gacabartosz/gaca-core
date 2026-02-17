# G.A.C.A. — Generative AI Arbitrage Engine

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
# Edit .env — add your free API keys (see below)

# 4. Initialize database
npx prisma generate
npx prisma db push
npm run seed:force

# 5. Start
npm run dev
# Server: http://localhost:3002
# Dashboard: http://localhost:5173
```

## Free API Keys — Where to Get Them

All these providers offer **free tiers** with no credit card required:

| Provider | Free Tier | Models | Get Key |
|----------|-----------|--------|---------|
| **Groq** | 30 RPM, 14,400 RPD | Llama 3.3 70B, Llama 3.1 8B, Qwen 3, Kimi K2, GPT-OSS | [console.groq.com/keys](https://console.groq.com/keys) |
| **Cerebras** | 30 RPM, 14,400 RPD | Llama 3.3 70B, Qwen 3 235B, GPT-OSS 120B | [cloud.cerebras.ai](https://cloud.cerebras.ai/) |
| **Google AI Studio** | 30 RPM, 14,400 RPD | Gemini 2.0/2.5 Flash, Gemma 3 | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **OpenRouter** | 20 RPM, 50 RPD | Llama 3.3, DeepSeek R1, Gemma 3, Kimi K2 (all :free) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Mistral AI** | 1 RPM, 500 RPD | Mistral Small, Nemo, Codestral | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| **HuggingFace** | Inference API | Llama 3.3, Mixtral, Qwen 2.5 | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| **Together AI** | $25 free credits | Llama 3.3, Qwen Coder, DeepSeek R1 | [api.together.xyz/settings](https://api.together.xyz/settings/api-keys) |
| **Fireworks AI** | Free tier | Llama 3.3, Qwen 3 235B | [fireworks.ai/api-keys](https://fireworks.ai/api-keys) |

Paid providers (optional): DeepSeek ($0.0001/1K tokens), Anthropic, OpenAI.

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
# {"status":"ok","providers":6,"models":36,"version":"1.0.0"}
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
   - New providers/models -> created automatically
   - Removed models -> disabled (not deleted, preserves history)
   - Config changes (URLs, rate limits) -> updated
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
# Add: 0 */6 * * * /root/gaca-core/scripts/auto-update.sh --cron >> /root/gaca-core/logs/auto-update.log 2>&1
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

- **Runtime**: Node.js + TypeScript
- **API**: Express.js
- **Database**: SQLite via Prisma ORM
- **Frontend**: React 19 + Vite + Tailwind CSS
- **AI Protocols**: OpenAI, Google AI, Anthropic, Custom

## License

MIT License - Bartosz Gaca
