# G.A.C.A. Modernization Plan v2 — Deep Quality Pass

> Ralph: work through priorities in order. Each task = ONE loop iteration.
> After each task: test, commit, move to next.
> CRITICAL: Read the FULL file/component before modifying it.

## Completed (v1 Plan — All Done)
- [x] SSE Streaming (GenericAdapter + endpoint + frontend TestPanel)
- [x] Zod validation (schemas + all routes)
- [x] Pino structured logging (replaced all console.log/error)
- [x] Vitest framework + RankingService + GenericAdapter + ModelSelector tests (64 passing)
- [x] PM2 ecosystem.config.js
- [x] Docker (Dockerfile + docker-compose.yml + .dockerignore)
- [x] GitHub Actions CI workflow
- [x] Frontend: loading skeletons, toast system, conversation history, provider health dashboard, sync/admin controls
- [x] API: rate limit headers, admin key auth
- [x] ESLint + Prettier (0 errors, 8 warnings)

---

## Priority 1: Fix Bugs (P0)

### Task 1.1: Fix route ordering — stats endpoint shadowed by :id param
- [ ] In `src/api/routes/providers.routes.ts`, the route `GET /stats/usage` is registered AFTER `GET /:id`
- [ ] Express matches in order, so `/api/providers/stats/usage` hits the `:id` handler with `id="stats"`
- [ ] **Fix:** Move ALL `/stats/*` routes BEFORE the `/:id` route
- [ ] Test: `curl localhost:3002/api/providers/stats/usage` should return usage data, not a 404

### Task 1.2: Fix avgLatencyMs overwrite bug in UsageTracker
- [ ] In `src/core/UsageTracker.ts`, the `trackRequest` method OVERWRITES `avgLatencyMs` with the latest latency instead of computing a running average
- [ ] **Fix:** Use incremental average formula: `newAvg = oldAvg + (latencyMs - oldAvg) / totalCalls`
- [ ] Apply the same fix in the DB update (`updateModelUsageInDb` method)
- [ ] Test: call the tracker 3 times with latencies 100, 200, 300 → avgLatencyMs should be 200

### Task 1.3: Fix default PORT mismatch
- [ ] In `src/api/server.ts`, the default `PORT` is 3001 but vite.config.ts proxies to 3002 and ecosystem.config.js sets 3002
- [ ] **Fix:** Change default PORT to `3002` in server.ts
- [ ] Verify: `npm run dev` should work without needing PORT in .env

---

## Priority 2: Security Hardening (P1)

### Task 2.1: Fix path traversal in prompt names
- [ ] In `src/prompts/loader.ts`, the `name` parameter is used directly in `path.join()` without sanitization
- [ ] A name like `../../etc/passwd` could read arbitrary files
- [ ] **Fix:** Add regex validation to prompt name: `/^[a-zA-Z0-9_-]+$/`
- [ ] Apply in `loadPrompt`, `savePrompt`, `deletePrompt` — reject invalid names with Error
- [ ] Also update `CreatePromptSchema` in `src/core/validation.ts` to add `.regex(/^[a-zA-Z0-9_-]+$/)` to name field
- [ ] Test: try to load `../../etc/passwd` → should throw validation error

### Task 2.2: Restrict CORS origins
- [ ] In `src/api/server.ts`, `cors()` is called with no options — allows ALL origins
- [ ] **Fix:** Read `CORS_ORIGINS` from env (comma-separated). If set, restrict to those origins. If not set (dev mode), allow all
- [ ] Add `CORS_ORIGINS` to `.env.example` with comment
- [ ] Example: `CORS_ORIGINS=https://bartoszgaca.pl,http://localhost:5173`

### Task 2.3: Add rate limiting to /api/complete
- [ ] Install: `npm install express-rate-limit`
- [ ] Create rate limiter: 60 requests/minute per IP for `/api/complete` and `/api/complete/stream`
- [ ] Read `RATE_LIMIT_RPM` from env (default 60)
- [ ] Return standard rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After)
- [ ] Test: verify headers appear on `/api/complete` response

### Task 2.4: Add prompt max length and request size limits
- [ ] In `src/api/server.ts`, add `express.json({ limit: '1mb' })` (explicit size)
- [ ] In `src/core/validation.ts`, add `.max(100000)` to prompt field in `CompleteRequestSchema` and `StreamRequestSchema`
- [ ] In `CreatePromptSchema`, add `.max(50000)` to the `content` field
- [ ] Test: send oversized prompt → 400 error

---

## Priority 3: Critical Missing Tests (P1)

### Task 3.1: Add AIEngine tests
- [ ] Create `src/core/__tests__/AIEngine.test.ts`
- [ ] Mock `GenericAdapter.complete()`, `ModelSelector`, `UsageTracker`, `RankingService`
- [ ] Test cases:
  - Successful completion returns AIResponse with all fields
  - Failover: first model fails → second model succeeds
  - All models fail → throws error with attempts list
  - `completeWithProvider`: uses specified provider
  - `completeWithModel`: uses specified model
  - Adapter caching: same provider reuses adapter instance
- [ ] Run `npm test` — all tests must pass

### Task 3.2: Add UsageTracker tests
- [ ] Create `src/core/__tests__/UsageTracker.test.ts`
- [ ] Mock Prisma client
- [ ] Test cases:
  - `canMakeRequest` returns true when under limits
  - `canMakeRequest` returns false when RPM exhausted
  - `canMakeRequest` returns false when RPD exhausted
  - `trackRequest` increments counters correctly
  - `trackRequest` calculates running average latency correctly
  - Minute counter resets after 60 seconds
  - Day counter resets after midnight
- [ ] Run `npm test` — all tests must pass

### Task 3.3: Add API integration tests with supertest
- [ ] Install: `npm install -D supertest @types/supertest`
- [ ] Create `src/api/__tests__/api.test.ts`
- [ ] Export the Express app from server.ts (without calling `.listen()` in test mode)
- [ ] Test cases:
  - `GET /health` returns 200 with status ok
  - `GET /api/providers` returns array
  - `GET /api/providers/stats/usage` returns usage data (NOT caught by :id route)
  - `POST /api/complete` with empty prompt returns 400 (Zod validation)
  - `POST /api/complete` with valid prompt returns 200 (mock AIEngine)
  - Auth: `POST /api/providers` without auth key returns 401 when GACA_ADMIN_KEY is set
  - Auth: `GET /api/providers` works without auth key
- [ ] Run `npm test` — all tests must pass

---

## Priority 4: Eliminate `any` Types (P2)

### Task 4.1: Type ModelSelector formatters
- [ ] In `src/core/ModelSelector.ts`, `formatProvider(provider: any)` and `formatModel(model: any)` use `any`
- [ ] **Fix:** Import Prisma types: `import type { AIProvider, AIModel, AIModelRanking, AIModelUsage } from '@prisma/client'`
- [ ] Create proper types: `type ProviderWithModels = AIProvider & { models: (AIModel & { ranking: AIModelRanking | null; usage: AIModelUsage | null })[] }`
- [ ] Replace `any` in all formatters with proper Prisma types
- [ ] Also fix `const updateData: any = {}` in `models.routes.ts:145`, `providers.routes.ts:141`, `ranking.routes.ts:87` — use `Partial<>` or `Record<string, unknown>` types

### Task 4.2: Type catch blocks and API responses
- [ ] Replace ALL `catch (error: any)` with `catch (error: unknown)` in route files
- [ ] Add helper: `function getErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }`
- [ ] Put this helper in `src/core/logger.ts` or a new `src/core/utils.ts`
- [ ] Replace `error.message` with `getErrorMessage(error)` in all catch blocks
- [ ] In `src/frontend/api.ts`, replace `request<any>` calls with proper response types
- [ ] Enable `@typescript-eslint/no-explicit-any: 'warn'` in `eslint.config.mjs`
- [ ] Run lint — should have 0 `any` usages, or document the few remaining exceptions

---

## Priority 5: Code Quality Refactoring (P2)

### Task 5.1: Extract shared failover loop in AIEngine
- [ ] `complete()` and `completeStream()` share nearly identical failover loop logic
- [ ] Extract a private method: `private async executeWithFailover(mode: 'sync' | 'stream', request, options): Promise<AIResponse>`
- [ ] The method handles: model selection, adapter creation, attempt tracking, error handling, failover
- [ ] `complete()` and `completeStream()` become thin wrappers calling `executeWithFailover`
- [ ] Also merge common logic between `completeWithProvider` and `completeWithModel`
- [ ] Test: `npm test` must pass, `curl localhost:3002/api/complete` must work

### Task 5.2: Extract shared SSE parsing in GenericAdapter
- [ ] `parseOpenAIStream`, `parseGoogleStream`, `parseAnthropicStream` all share identical buffer/line-splitting logic
- [ ] Create private method: `private async parseSSEStream(response: Response, eventHandler: (line: string) => string | null): Promise<{text, tokens}>`
- [ ] Each format-specific method provides just the event handler (parsing the `data:` line format)
- [ ] Also deduplicate `buildGoogleRequest()` and the Google stream request building
- [ ] Test: streaming must still work: `curl -N POST localhost:3002/api/complete/stream -H 'Content-Type: application/json' -d '{"prompt":"Count 1 to 3"}'`

### Task 5.3: Extract shared system prompt loading in complete routes
- [ ] In `src/api/routes/complete.routes.ts`, the system prompt loading logic (lines ~22-29 and ~89-96) is duplicated
- [ ] Create helper function: `function resolveSystemPrompt(body: { systemPrompt?: string }): string | undefined`
- [ ] Use in both `/api/complete` and `/api/complete/stream` handlers

---

## Priority 6: Frontend Improvements (P2)

### Task 6.1: Add React error boundary
- [ ] Create `src/frontend/components/ErrorBoundary.tsx`
- [ ] Class component that catches render errors
- [ ] Show friendly error message with "Reload" button
- [ ] Wrap `<AppContent />` in `<ErrorBoundary>` in App.tsx
- [ ] Build frontend: `npm run build`

### Task 6.2: Make all grids responsive
- [ ] In `UsageStats.tsx`: change `grid-cols-4` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- [ ] In `TestPanel.tsx`: change `grid-cols-2` to `grid-cols-1 lg:grid-cols-2`
- [ ] In `PromptEditor.tsx`: change `grid-cols-4` to `grid-cols-1 lg:grid-cols-4`
- [ ] Add `overflow-x-auto` wrapper around all `<table>` elements (RankingTable, UsageStats failover table, ModelList)
- [ ] Build frontend: `npm run build`

### Task 6.3: Split TestPanel into smaller components
- [ ] TestPanel.tsx (428 lines) is too large — split into:
  - `TestForm.tsx` — prompt input, settings (temperature, maxTokens, stream toggle), send button
  - `TestResponse.tsx` — response display with provider badge, latency, tokens
  - `TestHistory.tsx` — conversation history list with clear button
- [ ] Keep TestPanel as the container coordinating these sub-components
- [ ] Move localStorage logic into a custom `useTestHistory()` hook
- [ ] Build frontend: `npm run build`

### Task 6.4: Add basic accessibility
- [ ] Add `role="tablist"` to the tab bar container and `role="tab"` + `aria-selected` to each tab in App.tsx
- [ ] Add `aria-label` to toggle buttons in ProviderList (enable/disable provider)
- [ ] Add `aria-label` to status dots (e.g., "Provider status: active")
- [ ] Replace `confirm()` calls with a custom `ConfirmDialog` component using `role="alertdialog"` + `aria-modal`
- [ ] Add focus trap to existing modals (ProviderForm, ModelForm)
- [ ] Build frontend: `npm run build`

---

## Priority 7: Infrastructure Polish (P2)

### Task 7.1: Fix Dockerfile issues
- [ ] Read the current `Dockerfile` and fix:
  - Remove duplicate `openssl` install in runtime stage (it's only needed in builder for Prisma)
  - Fix the `COPY index.html` line — the actual index.html is at `src/frontend/index.html`, but the built version is in `dist/frontend/index.html`
  - Change CMD to NOT run `prisma db push` on every start — only on first run
- [ ] Update `.dockerignore` if needed
- [ ] DON'T test Docker (no Docker installed)

### Task 7.2: Fix ecosystem.config.js to use compiled JS
- [ ] Currently uses `npx tsx src/api/server.ts` which interprets TypeScript at runtime
- [ ] **Fix:** Change script to `node dist/api/server.js` and add pre-start build step
- [ ] Or add a `post_deploy` script that runs `npm run build` before restart
- [ ] Verify: `pm2 restart gaca-core && sleep 2 && curl localhost:3002/health`

### Task 7.3: Improve CI workflow
- [ ] Read current `.github/workflows/ci.yml`
- [ ] Add: lint step (`npm run lint`)
- [ ] Add: format check step (`npx prettier --check src/`)
- [ ] Add: Node.js matrix testing (18, 20, 22)
- [ ] Add `engines` field to package.json: `"node": ">=18"`

---

## Priority 8: README & Documentation (P3)

### Task 8.1: Update README.md comprehensively
- [ ] Add **Docker** section (docker-compose up, environment variables)
- [ ] Add **Testing** section (`npm test`, `npm run lint`, `npm run format`)
- [ ] Add **Environment Variables** table (PORT, DATABASE_URL, GACA_ADMIN_KEY, CORS_ORIGINS, RATE_LIMIT_RPM, LOG_LEVEL)
- [ ] Add **Streaming** endpoint to API Reference (`POST /api/complete/stream` with SSE format)
- [ ] Add **Troubleshooting** section (port conflicts, SQLite lock, rate limits)
- [ ] Fix inconsistent GitHub URLs (ensure all point to `github.com/gacabartosz/gaca-core`)
- [ ] Verify `.env.example` exists and matches the README

---

## Priority 9: Performance Optimizations (P3)

### Task 9.1: Cache getAvailableModels in failover loop
- [ ] In `src/core/ModelSelector.ts`, `getNextModel()` calls `getAvailableModels()` on EVERY failover attempt
- [ ] With MAX_FAILOVER_ATTEMPTS=30, this could mean 30 DB queries per request
- [ ] **Fix:** Add an optional `cachedModels` parameter to `getNextModel`, or cache the result for the duration of one `executeWithFailover` call in AIEngine
- [ ] Test: completion should still work correctly with caching

### Task 9.2: Recalculate rankings in parallel
- [ ] In `src/core/RankingService.ts`, `recalculateAll` processes models sequentially
- [ ] **Fix:** Use `Promise.all` with batching (batch size 10) for parallel recalculation
- [ ] Test: `curl -X POST localhost:3002/api/ranking/recalculate` should still work

---

## Priority 10: Fix ESLint Warnings (P3)

### Task 10.1: Clean up all 8 ESLint warnings
- [ ] Fix unused `e` in `complete.routes.ts:26,93` — rename to `_e` or use `error`
- [ ] Fix unused `engine` in `models.routes.ts:8` — remove or prefix with `_`
- [ ] Fix unused `next` in `server.ts:151` — rename to `_next`
- [ ] Fix unused `id` in `UsageTracker.ts:112,119` — remove destructuring or prefix with `_`
- [ ] Fix unused `beforeEach` imports in test files — remove the import
- [ ] Run `npm run lint` — should show 0 warnings

---

## Final Task: Commit All & Push

### Task FINAL: Push everything to GitHub
- [ ] Run `npm test` — all tests must pass
- [ ] Run `npm run lint` — 0 errors, 0 warnings
- [ ] Run `npm run build` — frontend builds successfully
- [ ] `curl localhost:3002/health` — server responds OK
- [ ] `git add -A && git status` — review all changes
- [ ] `git push origin main`
