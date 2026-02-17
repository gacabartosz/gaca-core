// Complete Routes - AI completion endpoints

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AIEngine } from '../../core/AIEngine.js';
import { loadPrompt } from '../../prompts/loader.js';
import { generateRequestId } from '../../core/types.js';

export function createCompleteRoutes(prisma: PrismaClient, engine: AIEngine): Router {
  const router = Router();

  // POST /api/complete - Execute AI completion
  router.post('/', async (req: Request, res: Response) => {
    const requestId = generateRequestId();

    try {
      const {
        prompt,
        systemPrompt,
        systemPromptName,
        temperature,
        maxTokens,
        providerId,
        modelId,
      } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'prompt is required', requestId });
      }

      // Load system prompt from file if name provided
      let finalSystemPrompt = systemPrompt;
      if (systemPromptName && !systemPrompt) {
        try {
          finalSystemPrompt = loadPrompt(systemPromptName);
        } catch (e) {
          return res.status(400).json({ error: `System prompt not found: ${systemPromptName}`, requestId });
        }
      }

      let response;
      const aiRequest = {
        prompt,
        systemPrompt: finalSystemPrompt,
        temperature,
        maxTokens,
        requestId,
      };

      if (modelId) {
        response = await engine.completeWithModel(modelId, aiRequest);
      } else if (providerId) {
        response = await engine.completeWithProvider(providerId, aiRequest);
      } else {
        response = await engine.complete(aiRequest);
      }

      res.json(response);
    } catch (error: any) {
      console.error(`[API][${requestId}] Completion failed:`, error.message);
      res.status(500).json({ error: error.message, requestId });
    }
  });

  // GET /api/complete/available - Get available models for completion
  router.get('/available', async (req: Request, res: Response) => {
    try {
      const available = await engine.getModelSelector().getAvailableModels();

      res.json(
        available.map((item) => ({
          modelId: item.model.id,
          modelName: item.model.displayName || item.model.name,
          providerId: item.provider.id,
          providerName: item.provider.name,
          score: item.model.ranking?.score || 0,
          successRate: item.model.ranking?.successRate || 0,
          avgLatencyMs: item.model.ranking?.avgLatencyMs || 0,
        }))
      );
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/complete/failovers - Get recent failover events
  router.get('/failovers', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await engine.getFailoverEvents(limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
