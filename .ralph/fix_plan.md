# G.A.C.A. Modernization Plan

> Ralph: work through priorities in order. Each task = ONE loop iteration.
> After each task: test, commit, move to next.
> CRITICAL: Read the FULL file/component before modifying it.

## Completed (Previous Sessions)
- [x] Core stability (11 providers, 51 models, auto-update, sync, seed)
- [x] Provider testing (5/6 working: Groq, Cerebras, Google AI, OpenRouter, Mistral)
- [x] Request ID tracking and improved error messages
- [x] Frontend built and served from Express (dist/frontend/)
- [x] Nginx proxy on bartoszgaca.pl/gaca/
- [x] Failover verified (disable Groq → auto-switch to Cerebras)
- [x] Ranking recalculation verified (Mistral 0.843 > Groq 0.833 > Google 0.806)

---

## Priority 1: Streaming Support (SSE)

This is the #1 missing feature. Modern AI apps MUST stream tokens.

### Task 1.1: Add SSE streaming to GenericAdapter (DONE)
- [x] In `src/core/GenericAdapter.ts`, add `completeStream()` method
- [x] For OpenAI-format providers: pass `stream: true`, parse SSE chunks
- [x] For Google format: use `streamGenerateContent` URL with `alt=sse`, parse SSE
- [x] For Anthropic format: pass `stream: true`, parse Anthropic SSE events
- [x] Method signature: `async completeStream(model, request, onToken): Promise<AIResponse>`
- [x] Return final AIResponse with total tokens/latency after stream ends

### Task 1.2: Add SSE streaming endpoint (DONE)
- [x] Create `POST /api/complete/stream` in `src/api/routes/complete.routes.ts`
- [x] SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- [x] Token events: `data: {"token":"word","done":false}\n\n`
- [x] Final event: `data: {"token":"","done":true,"model":"...","providerName":"...",...}\n\n`
- [x] Failover: if stream fails, error event sent and connection closed
- [x] Tested: Mistral (OpenAI format), Google (Google format) — both streaming correctly
- [x] Also added `completeStream()` to AIEngine with failover support

### Task 1.3: Add streaming to frontend TestPanel (DONE)
- [x] In `TestPanel.tsx`, add "Stream" toggle checkbox
- [x] When streaming, use `fetch()` + `response.body.getReader()` + `TextDecoder` to read SSE
- [x] Tokens appear character-by-character in response panel (typewriter effect)
- [x] Show final stats after stream completes
- [x] Build frontend after changes: `npm run build`

---

## Priority 2: Input Validation with Zod

### Task 2.1: Install Zod and create validation schemas (DONE)
- [x] Run: `npm install zod`
- [x] Create `src/core/validation.ts` with schemas for:
  - `CompleteRequestSchema` (prompt, systemPrompt, temperature, maxTokens, providerId, modelId)
  - `StreamRequestSchema` (prompt, systemPrompt, temperature, maxTokens)
  - `CreateProviderSchema` (name, slug, baseUrl, apiKey, apiFormat, etc.)
  - `UpdateProviderSchema` (partial of Create)
  - `CreateModelSchema` (name, providerId, etc.)
  - `UpdateModelSchema` (partial of Create)
  - `UpdateQualityScoreSchema`, `UpdateRankingWeightsSchema`
  - `CreatePromptSchema`, `UpdatePromptSchema`
- [x] Create `validateBody(schema)` Express middleware that returns 400 with Zod errors

### Task 2.2: Apply validation to all routes (DONE)
- [x] Apply to `POST /api/complete` and `POST /api/complete/stream`
- [x] Apply to POST/PUT on providers, models, prompts
- [x] Apply to PUT on ranking (quality score, weights)
- [x] Test: send invalid request, verify 400 with clear error message

---

## Priority 3: Structured Logging with Pino

### Task 3.1: Setup Pino logger (DONE)
- [x] Run: `npm install pino` and `npm install -D pino-pretty`
- [x] Create `src/core/logger.ts` with pino + pino-pretty
- [x] Replace ALL `console.log` and `console.error` in src/ with logger calls
- [x] Use structured logging: `logger.info({ requestId, provider, model, latencyMs }, 'Completion OK')`
- [x] Keep log output clean — don't log full request/response bodies

---

## Priority 4: Testing with Vitest

### Task 4.1: Setup Vitest framework (DONE)
- [x] Run: `npm install -D vitest`
- [x] Create `vitest.config.ts` in project root
- [x] Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`
- [x] Verify setup: create a trivial test, run `npm test`

### Task 4.2: Write RankingService tests (DONE)
- [x] Create `src/core/__tests__/RankingService.test.ts`
- [x] Test score calculation: known inputs → expected output
- [x] Test edge cases: 0 samples, all failures, perfect score, extreme latency

### Task 4.3: Write GenericAdapter request-building tests (DONE)
- [x] Create `src/core/__tests__/GenericAdapter.test.ts`
- [x] Test `buildRequest()` for each format: openai, google, anthropic, custom
- [x] Test `parseResponse()` for each format
- [x] Mock fetch — don't make real API calls in tests

### Task 4.4: Write ModelSelector tests (DONE)
- [x] Create `src/core/__tests__/ModelSelector.test.ts`
- [x] Test model selection order (highest ranking first)
- [x] Test rate limit filtering (skip exhausted models)
- [x] Test that excluded models are skipped

---

## Priority 5: PM2 Ecosystem Config

### Task 5.1: Create ecosystem.config.js (DONE)
- [x] Create `ecosystem.config.js` in project root
- [x] Configure: name gaca-core, script npx tsx src/api/server.ts, port 3002, max_memory 200M, log files in logs/
- [x] Restart gaca-core with: `pm2 delete gaca-core && pm2 start ecosystem.config.js`
- [x] Verify with `pm2 list` and `curl localhost:3002/health`

---

## Priority 6: Docker Support

### Task 6.1: Create Dockerfile + docker-compose (DONE)
- [x] Create `Dockerfile` (multi-stage: build + runtime with node:20-slim)
- [x] Create `.dockerignore` (node_modules, .git, .ralph, *.db, .env, logs)
- [x] Create `docker-compose.yml` with volume for SQLite persistence + .env file
- [x] DON'T test Docker (no Docker on this server) — just create the files

---

## Priority 7: GitHub Actions CI

### Task 7.1: Create CI workflow (DONE)
- [x] Create `.github/workflows/ci.yml`
- [x] Steps: checkout → setup node 20 → npm ci → prisma generate → build → test
- [x] Run on push and pull_request

---

## Priority 8: Frontend Improvements

### Task 8.1: Add loading skeletons (DONE)
- [x] Create `src/frontend/components/Skeleton.tsx` — animated pulse placeholder
- [x] Replace "Loading..." text in ProviderList, RankingTable, UsageStats
- [x] Use Tailwind `animate-pulse bg-gray-700 rounded` pattern
- [x] Fixed pre-existing Express route param TypeScript errors (removed typed params, added `as string` casts)

### Task 8.2: Add toast notification system
- [ ] Create `src/frontend/components/Toast.tsx` — stack of toasts in top-right
- [ ] Create `useToast()` hook or simple context
- [ ] Show toasts for: provider test result, sync trigger, ranking recalculate, errors
- [ ] Auto-dismiss after 4 seconds

### Task 8.3: Improve TestPanel with conversation history
- [ ] Store prompt/response pairs in component state
- [ ] Show scrollable history: each entry shows prompt, response, provider badge, latency
- [ ] Add "Clear" button
- [ ] Persist to localStorage

### Task 8.4: Add provider health dashboard
- [ ] In ProviderList, show colored status dots (green/yellow/red)
- [ ] Add "Test All Providers" button → test each sequentially, show results
- [ ] Show mini latency comparison (text or simple bars)

### Task 8.5: Add sync/admin controls to header
- [ ] Add "Sync Providers" button to App header (calls POST /api/admin/sync-providers)
- [ ] Show last sync status and time
- [ ] Add auto-refresh toggle (10s interval) for Usage tab

### IMPORTANT: After ALL frontend tasks, run `npm run build` to rebuild dist/frontend/

---

## Priority 9: API Improvements

### Task 9.1: Add rate limit headers ✅ DONE
- [x] X-Request-Id middleware on all /api/* responses
- [x] X-Provider, X-Model, X-Latency-Ms on /api/complete responses
- [x] X-RateLimit-Limit-Minute, X-RateLimit-Remaining-Minute (provider/model RPM)
- [x] X-RateLimit-Limit-Day, X-RateLimit-Remaining-Day (provider/model RPD)
- [x] getRateLimitInfo() method added to AIEngine for rate limit lookups
- Verified: Mistral AI 1 RPM / 500 RPD correctly reported in headers

### Task 9.2: Add API key authentication for admin endpoints
- [ ] Add `GACA_ADMIN_KEY` to `.env` and `.env.example`
- [ ] Create `authMiddleware` that checks `Authorization: Bearer <key>`
- [ ] Apply to: POST/PUT/DELETE on providers, models, prompts, and admin endpoints
- [ ] Leave GET endpoints and POST /api/complete publicly accessible

---

## Priority 10: Developer Experience

### Task 10.1: Add ESLint + Prettier
- [ ] Run: `npm install -D eslint @eslint/js typescript-eslint prettier eslint-config-prettier`
- [ ] Create `eslint.config.mjs` (flat config format)
- [ ] Create `.prettierrc`: `{ "singleQuote": true, "trailingComma": "all", "printWidth": 120 }`
- [ ] Add scripts: `"lint": "eslint src/"`, `"format": "prettier --write src/"`
- [ ] Run lint+format, fix errors, commit
