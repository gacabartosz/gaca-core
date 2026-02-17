// GACA-Core API Server

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { AIEngine } from '../core/AIEngine.js';
import { DEFAULT_PROVIDERS } from '../core/types.js';
import { createProviderRoutes } from './routes/providers.routes.js';
import { createModelRoutes } from './routes/models.routes.js';
import { createRankingRoutes } from './routes/ranking.routes.js';
import { createPromptRoutes } from './routes/prompts.routes.js';
import { createCompleteRoutes } from './routes/complete.routes.js';

// Load environment variables
config();

const PORT = process.env.PORT || 3001;

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize AI Engine
const engine = new AIEngine(prisma);

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
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

// Admin: trigger provider sync
app.post('/api/admin/sync-providers', async (req: Request, res: Response) => {
  try {
    // Dynamic import to avoid circular deps
    const { syncProviders } = await import('../../scripts/sync-providers.js');
    const result = await syncProviders();
    res.json({ success: true, result });
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
  const summary = DEFAULT_PROVIDERS.map(p => ({
    name: p.name,
    slug: p.slug,
    priority: p.priority,
    modelCount: p.models.length,
    models: p.models.map(m => m.name),
  }));
  res.json({ providers: summary, total: DEFAULT_PROVIDERS.length });
});

// API Routes
app.use('/api/providers', createProviderRoutes(prisma, engine));
app.use('/api/models', createModelRoutes(prisma, engine));
app.use('/api/ranking', createRankingRoutes(prisma, engine));
app.use('/api/prompts', createPromptRoutes());
app.use('/api/complete', createCompleteRoutes(prisma, engine));

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
async function start() {
  try {
    await prisma.$connect();
    console.log('Database connected');

    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║                     GACA-Core API                      ║
╠════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}              ║
║                                                        ║
║  Endpoints:                                            ║
║  - GET  /health                Health check            ║
║  - GET  /api/providers         List providers          ║
║  - POST /api/providers         Create provider         ║
║  - POST /api/providers/:id/test Test provider          ║
║  - GET  /api/models            List models             ║
║  - POST /api/models            Create model            ║
║  - GET  /api/ranking           Get rankings            ║
║  - POST /api/ranking/recalculate Recalculate ranks     ║
║  - GET  /api/prompts           List prompts            ║
║  - POST /api/complete          AI completion           ║
╚════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

start();
