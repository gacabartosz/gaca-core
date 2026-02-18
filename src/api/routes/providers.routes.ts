// Provider Routes - CRUD operations for AI providers

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AIEngine } from '../../core/AIEngine.js';
import { validateBody, CreateProviderSchema, UpdateProviderSchema } from '../../core/validation.js';

export function createProviderRoutes(prisma: PrismaClient, engine: AIEngine): Router {
  const router = Router();

  // GET /api/providers - List all providers
  router.get('/', async (req: Request, res: Response) => {
    try {
      const providers = await prisma.aIProvider.findMany({
        orderBy: { priority: 'asc' },
        include: {
          models: {
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
            include: { usage: true, ranking: true },
          },
          usage: true,
        },
      });

      // Don't expose API keys in list
      const sanitized = providers.map((p) => ({
        ...p,
        apiKey: p.apiKey ? '***configured***' : null,
        customHeaders: JSON.parse(p.customHeaders || '{}'),
      }));

      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/providers/:id - Get single provider
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const provider = await prisma.aIProvider.findUnique({
        where: { id: req.params.id as string },
        include: {
          models: {
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
            include: { usage: true, ranking: true },
          },
          usage: true,
        },
      });

      if (!provider) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      res.json({
        ...provider,
        apiKey: provider.apiKey ? '***configured***' : null,
        customHeaders: JSON.parse(provider.customHeaders || '{}'),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/providers - Create provider
  router.post('/', validateBody(CreateProviderSchema), async (req: Request, res: Response) => {
    try {
      const {
        name,
        slug,
        baseUrl,
        apiKey,
        apiFormat,
        authHeader,
        authPrefix,
        customHeaders,
        rateLimitRpm,
        rateLimitRpd,
        priority,
        isEnabled,
      } = req.body;

      const provider = await prisma.aIProvider.create({
        data: {
          name,
          slug,
          baseUrl,
          apiKey: apiKey || null,
          apiFormat: apiFormat || 'openai',
          authHeader: authHeader || 'Authorization',
          authPrefix: authPrefix || 'Bearer ',
          customHeaders: JSON.stringify(customHeaders || {}),
          rateLimitRpm: rateLimitRpm || null,
          rateLimitRpd: rateLimitRpd || null,
          priority: priority || 100,
          isEnabled: isEnabled !== false,
          usage: {
            create: {
              requestsToday: 0,
              requestsThisMinute: 0,
              dayResetAt: new Date(),
              minuteResetAt: new Date(),
            },
          },
        },
      });

      engine.clearAdapterCache();

      res.status(201).json({
        ...provider,
        apiKey: provider.apiKey ? '***configured***' : null,
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Provider with this name or slug already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/providers/:id - Update provider
  router.put('/:id', validateBody(UpdateProviderSchema), async (req: Request, res: Response) => {
    try {
      const {
        name,
        slug,
        baseUrl,
        apiKey,
        apiFormat,
        authHeader,
        authPrefix,
        customHeaders,
        rateLimitRpm,
        rateLimitRpd,
        priority,
        isEnabled,
      } = req.body;

      const updateData: any = {};

      if (name !== undefined) updateData.name = name;
      if (slug !== undefined) updateData.slug = slug;
      if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
      if (apiKey !== undefined) updateData.apiKey = apiKey || null;
      if (apiFormat !== undefined) updateData.apiFormat = apiFormat;
      if (authHeader !== undefined) updateData.authHeader = authHeader;
      if (authPrefix !== undefined) updateData.authPrefix = authPrefix;
      if (customHeaders !== undefined) updateData.customHeaders = JSON.stringify(customHeaders);
      if (rateLimitRpm !== undefined) updateData.rateLimitRpm = rateLimitRpm;
      if (rateLimitRpd !== undefined) updateData.rateLimitRpd = rateLimitRpd;
      if (priority !== undefined) updateData.priority = priority;
      if (isEnabled !== undefined) updateData.isEnabled = isEnabled;

      const provider = await prisma.aIProvider.update({
        where: { id: req.params.id as string },
        data: updateData,
      });

      engine.clearAdapterCache(req.params.id as string);

      res.json({
        ...provider,
        apiKey: provider.apiKey ? '***configured***' : null,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Provider not found' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/providers/:id - Delete provider
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await prisma.aIProvider.delete({
        where: { id: req.params.id as string },
      });

      engine.clearAdapterCache(req.params.id as string);

      res.status(204).send();
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Provider not found' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/providers/:id/test - Test provider connection
  router.post('/:id/test', async (req: Request, res: Response) => {
    try {
      const result = await engine.testProvider(req.params.id as string);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/providers/usage - Get usage summary
  router.get('/stats/usage', async (req: Request, res: Response) => {
    try {
      const providers = await prisma.aIProvider.findMany({
        include: { usage: true },
      });

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const failoverCount = await prisma.aIFailoverEvent.count({
        where: { createdAt: { gte: todayStart } },
      });

      let totalRequests = 0;
      let totalTokens = 0;
      let totalCost = 0;

      const providerStats = providers.map((p) => {
        const usage = p.usage;
        totalRequests += usage?.requestsToday || 0;
        totalTokens += usage?.totalTokensUsed || 0;
        totalCost += usage?.totalCostUsd || 0;

        return {
          id: p.id,
          name: p.name,
          requestsToday: usage?.requestsToday || 0,
          dailyLimit: p.rateLimitRpd,
          usagePercent: p.rateLimitRpd ? Math.round(((usage?.requestsToday || 0) / p.rateLimitRpd) * 100) : 0,
          totalTokensUsed: usage?.totalTokensUsed || 0,
          isEnabled: p.isEnabled,
        };
      });

      res.json({
        totalRequestsToday: totalRequests,
        totalTokensToday: totalTokens,
        estimatedCost: Math.round(totalCost * 10000) / 10000,
        failoverEventsToday: failoverCount,
        providers: providerStats,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
