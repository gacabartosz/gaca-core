# Ralph Agent Configuration — G.A.C.A.

## Build Instructions

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Build TypeScript
npm run build
```

## Seed / Reset Database

```bash
# Seed with all providers (non-interactive)
npm run seed:force

# Sync providers from code (non-destructive)
npm run sync

# Preview sync changes
npm run sync:dry
```

## Run Instructions

```bash
# Development (server + frontend)
npm run dev

# Server only (with file watching)
npm run dev:server

# Production
npm run build && npm start
```

## Test Instructions

```bash
# Test all configured providers
npx tsx scripts/test-providers.ts

# Quick health check
curl http://localhost:3002/health

# Test AI completion
curl -X POST http://localhost:3002/api/complete \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Say OK"}'

# Check available models
curl http://localhost:3002/api/complete/available
```

## Project Details

- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: SQLite via Prisma ORM
- **Port**: 3002
- **PM2 Process**: gaca-core
- **Key file for providers**: `src/core/types.ts` (DEFAULT_PROVIDERS)
