// Model Routes - CRUD operations for AI models

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AIEngine } from '../../core/AIEngine.js';
import { validateBody, CreateModelSchema, UpdateModelSchema } from '../../core/validation.js';

export function createModelRoutes(prisma: PrismaClient, engine: AIEngine): Router {
  const router = Router();

  // GET /api/models - List all models
  router.get('/', async (req: Request, res: Response) => {
    try {
      const providerId = req.query.providerId as string | undefined;

      const where = providerId ? { providerId } : {};

      const models = await prisma.aIModel.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: {
          provider: { select: { id: true, name: true, slug: true } },
          usage: true,
          ranking: true,
        },
      });

      res.json(models);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/models/:id - Get single model
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const modelId = req.params.id as string;
      const model = await prisma.aIModel.findUnique({
        where: { id: modelId },
        include: {
          provider: { select: { id: true, name: true, slug: true } },
          usage: true,
          ranking: true,
        },
      });

      if (!model) {
        return res.status(404).json({ error: 'Model not found' });
      }

      res.json(model);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/models - Create model
  router.post('/', validateBody(CreateModelSchema), async (req: Request, res: Response) => {
    try {
      const {
        providerId,
        name,
        displayName,
        rateLimitRpm,
        rateLimitRpd,
        costPer1kInput,
        costPer1kOutput,
        maxTokens,
        contextWindow,
        isEnabled,
        isDefault,
      } = req.body;

      // If setting as default, unset other defaults for this provider
      if (isDefault) {
        await prisma.aIModel.updateMany({
          where: { providerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const model = await prisma.aIModel.create({
        data: {
          providerId,
          name,
          displayName: displayName || null,
          rateLimitRpm: rateLimitRpm || null,
          rateLimitRpd: rateLimitRpd || null,
          costPer1kInput: costPer1kInput || 0,
          costPer1kOutput: costPer1kOutput || 0,
          maxTokens: maxTokens || 4096,
          contextWindow: contextWindow || 8192,
          isEnabled: isEnabled !== false,
          isDefault: isDefault || false,
          usage: {
            create: {
              requestsToday: 0,
              requestsThisMinute: 0,
              dayResetAt: new Date(),
              minuteResetAt: new Date(),
            },
          },
          ranking: {
            create: {
              successRate: 0,
              avgLatencyMs: 0,
              avgQualityScore: 0.5,
              score: 0.5,
              sampleSize: 0,
            },
          },
        },
        include: {
          provider: { select: { id: true, name: true, slug: true } },
          usage: true,
          ranking: true,
        },
      });

      res.status(201).json(model);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Model with this name already exists for this provider' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/models/:id - Update model
  router.put('/:id', validateBody(UpdateModelSchema), async (req: Request, res: Response) => {
    try {
      const {
        name,
        displayName,
        rateLimitRpm,
        rateLimitRpd,
        costPer1kInput,
        costPer1kOutput,
        maxTokens,
        contextWindow,
        isEnabled,
        isDefault,
      } = req.body;

      const updateData: Record<string, unknown> = {};

      if (name !== undefined) updateData.name = name;
      if (displayName !== undefined) updateData.displayName = displayName;
      if (rateLimitRpm !== undefined) updateData.rateLimitRpm = rateLimitRpm;
      if (rateLimitRpd !== undefined) updateData.rateLimitRpd = rateLimitRpd;
      if (costPer1kInput !== undefined) updateData.costPer1kInput = costPer1kInput;
      if (costPer1kOutput !== undefined) updateData.costPer1kOutput = costPer1kOutput;
      if (maxTokens !== undefined) updateData.maxTokens = maxTokens;
      if (contextWindow !== undefined) updateData.contextWindow = contextWindow;
      if (isEnabled !== undefined) updateData.isEnabled = isEnabled;

      // Handle isDefault separately
      if (isDefault !== undefined) {
        const model = await prisma.aIModel.findUnique({ where: { id: req.params.id as string } });
        if (model && isDefault) {
          await prisma.aIModel.updateMany({
            where: { providerId: model.providerId, isDefault: true },
            data: { isDefault: false },
          });
        }
        updateData.isDefault = isDefault;
      }

      const model = await prisma.aIModel.update({
        where: { id: req.params.id as string },
        data: updateData,
        include: {
          provider: { select: { id: true, name: true, slug: true } },
          usage: true,
          ranking: true,
        },
      });

      res.json(model);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Model not found' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/models/:id - Delete model
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await prisma.aIModel.delete({
        where: { id: req.params.id as string },
      });

      res.status(204).send();
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Model not found' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
