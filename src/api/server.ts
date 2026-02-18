// GACA-Core API Server

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

import { AIEngine } from '../core/AIEngine.js';
import { DEFAULT_PROVIDERS, generateRequestId } from '../core/types.js';
import { logger } from '../core/logger.js';
import { createProviderRoutes } from './routes/providers.routes.js';
import { createModelRoutes } from './routes/models.routes.js';
import { createRankingRoutes } from './routes/ranking.routes.js';
import { createPromptRoutes } from './routes/prompts.routes.js';
import { createCompleteRoutes } from './routes/complete.routes.js';
import { createCompatRoutes } from './routes/compat.routes.js';

// Load environment variables
config();

const PORT = process.env.PORT || 3002;
const ADMIN_KEY = process.env.GACA_ADMIN_KEY;
const CORS_ORIGINS = process.env.CORS_ORIGINS;
const RATE_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_RPM || '60', 10);

// Auth middleware: protects write operations when GACA_ADMIN_KEY is set
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip if no admin key configured (dev mode)
  if (!ADMIN_KEY) return next();
  // Allow read-only methods without auth
  if (req.method === 'GET') return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required. Use: Authorization: Bearer <GACA_ADMIN_KEY>' });
  }

  const token = authHeader.slice(7);
  if (token !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }

  next();
}

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize AI Engine
const engine = new AIEngine(prisma);

// Create Express app
const app = express();

// Middleware
app.use(
  cors(
    CORS_ORIGINS
      ? { origin: CORS_ORIGINS.split(',').map((o) => o.trim()) }
      : undefined,
  ),
);
app.use(express.json({ limit: '1mb' }));

// Add X-Request-Id to all API responses
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  res.set('X-Request-Id', generateRequestId());
  next();
});

// Request logging with timing
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  logger.info({ method: req.method, path: req.path }, 'Request');
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.info({ method: req.method, path: req.path, durationMs: duration, status: res.statusCode }, 'Slow request');
    }
  });
  next();
});

// Health check
app.get('/health', async (req: Request, res: Response) => {
  const providerCount = await prisma.aIProvider.count({ where: { isEnabled: true } });
  const modelCount = await prisma.aIModel.count({ where: { isEnabled: true } });
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: providerCount,
    models: modelCount,
    version: '1.0.0',
  });
});

// Admin: trigger provider sync (auth required)
app.post('/api/admin/sync-providers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { execSync } = await import('child_process');
    const output = execSync('npx tsx scripts/sync-providers.ts', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 30000,
    });
    res.json({ success: true, output });
  } catch (error: any) {
    res.status(500).json({ error: 'Sync failed', message: error.message });
  }
});

// Admin: get sync status
app.get('/api/admin/sync-status', (req: Request, res: Response) => {
  const logPath = resolve(process.cwd(), 'logs/last-sync.json');
  if (existsSync(logPath)) {
    const data = JSON.parse(readFileSync(logPath, 'utf-8'));
    res.json({ lastSync: data });
  } else {
    res.json({ lastSync: null, message: 'No sync has been performed yet' });
  }
});

// Admin: list configured providers from code (DEFAULT_PROVIDERS)
app.get('/api/admin/default-providers', (req: Request, res: Response) => {
  const summary = DEFAULT_PROVIDERS.map((p) => ({
    name: p.name,
    slug: p.slug,
    priority: p.priority,
    modelCount: p.models.length,
    models: p.models.map((m) => m.name),
  }));
  res.json({ providers: summary, total: DEFAULT_PROVIDERS.length });
});

// API Routes (auth middleware protects write operations on CRUD routes)
app.use('/api/providers', authMiddleware, createProviderRoutes(prisma, engine));
app.use('/api/models', authMiddleware, createModelRoutes(prisma, engine));
app.use('/api/ranking', authMiddleware, createRankingRoutes(prisma, engine));
app.use('/api/prompts', authMiddleware, createPromptRoutes());
// Rate limiter for completion endpoints
const completionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_RPM,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
// Complete endpoints are publicly accessible (no auth) but rate-limited
app.use('/api/complete', completionLimiter, createCompleteRoutes(prisma, engine));
// Compat endpoints for bartoszgaca.pl services (/api/gaca/*)
app.use('/api/gaca', completionLimiter, createCompatRoutes(prisma, engine));

// Serve frontend static files (production build)
const frontendPath = resolve(process.cwd(), 'dist/frontend');
if (existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  // SPA fallback — serve index.html for non-API routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      return next();
    }
    res.sendFile(join(frontendPath, 'index.html'));
  });
  logger.info('Serving frontend from dist/frontend/');
}

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err }, 'Server error');
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Export app for testing (supertest)
export { app };

// Start server (skip in test mode)
async function start() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'GACA-Core API server started');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
  start();
}
