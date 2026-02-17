# G.A.C.A. Fix Plan

## Priority 1: Core Stability (DONE)
- [x] Update DEFAULT_PROVIDERS with latest free models (53 models, 11 providers)
- [x] Add --force flag to seed script
- [x] Fix Google AI env key mapping (GOOGLE_AI_API_KEY)
- [x] Add /health endpoint with provider/model counts
- [x] Create sync-providers.ts for non-destructive DB sync
- [x] Create auto-update.sh for git-based auto-update
- [x] Add admin endpoints (sync-providers, sync-status, default-providers)
- [x] Create comprehensive English README.md
- [x] Update .env.example with all 11 providers

## Priority 2: Testing & Verification
- [ ] Test each free provider individually (Groq, Cerebras, Google, OpenRouter, Mistral)
- [ ] Verify failover: disable Groq, confirm auto-switch to Cerebras
- [ ] Verify ranking recalculation after 10+ requests
- [ ] Load test: send 50 requests, check rate limit handling
- [ ] Test sync-providers with simulated new model addition

## Priority 3: Code Quality
- [ ] Add unit tests for GenericAdapter (all 4 formats)
- [ ] Add unit tests for ModelSelector
- [ ] Add unit tests for sync-providers logic
- [ ] Improve error messages (include provider name and model in all errors)
- [ ] Add request ID tracking for debugging

## Priority 4: Frontend Dashboard
- [ ] Verify React admin dashboard works with new providers
- [ ] Add sync status display to dashboard
- [ ] Add auto-update trigger button
- [ ] Show failover events in dashboard

## Priority 5: Production Readiness
- [ ] Add PM2 ecosystem config (ecosystem.config.js)
- [ ] Add Docker support (Dockerfile + docker-compose.yml)
- [ ] Add rate limit headers to API responses
- [ ] Add API key authentication for admin endpoints
- [ ] Create migration guide from bartoszgaca.pl GACA to standalone
