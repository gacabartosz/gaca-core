// Compatibility routes — /api/gaca/* endpoints
// Wraps gaca-core responses in {success, data} format expected by bartoszgaca.pl services

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AIEngine } from '../../core/AIEngine.js';
import { loadPrompt } from '../../prompts/loader.js';
import { generateRequestId } from '../../core/types.js';
import { validateBody, GacaCompleteSchema } from '../../core/validation.js';
import { logger } from '../../core/logger.js';

export function createCompatRoutes(prisma: PrismaClient, engine: AIEngine): Router {
  const router = Router();

  // POST /api/gaca/complete — main completion endpoint (compat wrapper)
  router.post('/complete', validateBody(GacaCompleteSchema), async (req: Request, res: Response) => {
    const requestId = generateRequestId();

    try {
      const { prompt, messages, systemPrompt, systemPromptName, temperature, maxTokens, providerId, modelId, responseFormat } =
        req.body;

      // Resolve system prompt from file if name provided
      let finalSystemPrompt = systemPrompt;
      if (systemPromptName && !finalSystemPrompt) {
        try {
          finalSystemPrompt = loadPrompt(systemPromptName);
        } catch {
          return res.status(400).json({ success: false, error: `System prompt not found: ${systemPromptName}` });
        }
      }

      // Build AI request — pass messages directly to engine when available
      const aiRequest: Record<string, unknown> = {
        temperature,
        maxTokens,
        requestId,
      };

      if (messages && !prompt) {
        // Messages mode: pass through directly (supports vision/multimodal)
        aiRequest.messages = messages;
        // Only set systemPrompt if provided separately (not inside messages)
        if (finalSystemPrompt) {
          aiRequest.systemPrompt = finalSystemPrompt;
        }
      } else {
        // Prompt mode: simple text completion
        aiRequest.prompt = prompt;
        aiRequest.systemPrompt = finalSystemPrompt;
      }

      if (responseFormat) {
        aiRequest.responseFormat = responseFormat;
      }

      let response;
      if (modelId) {
        response = await engine.completeWithModel(modelId, aiRequest);
      } else if (providerId) {
        response = await engine.completeWithProvider(providerId, aiRequest);
      } else {
        response = await engine.complete(aiRequest);
      }

      // Build tokensUsed object
      const promptTokens = response.inputTokens ?? 0;
      const completionTokens = response.outputTokens ?? 0;
      const totalTokens = response.tokensUsed ?? promptTokens + completionTokens;

      res.json({
        success: true,
        data: {
          content: response.content,
          model: response.model,
          tokensUsed: {
            prompt: promptTokens,
            completion: completionTokens,
            total: totalTokens,
          },
          latencyMs: response.latencyMs,
          finishReason: response.finishReason ?? 'stop',
          providerId: response.providerId,
          providerName: response.providerName,
        },
      });
    } catch (error: any) {
      logger.error({ requestId, err: error.message }, 'Compat completion failed');
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/gaca/health — health check in compat format
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const providerCount = await prisma.aIProvider.count({ where: { isEnabled: true } });
      const modelCount = await prisma.aIModel.count({ where: { isEnabled: true } });

      res.json({
        success: true,
        data: {
          status: 'healthy',
          providers: providerCount,
          models: modelCount,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/gaca/status — list providers and models
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const providers = await prisma.aIProvider.findMany({
        where: { isEnabled: true },
        include: { models: { where: { isEnabled: true }, select: { id: true, name: true, displayName: true } } },
        orderBy: { priority: 'asc' },
      });

      res.json({
        success: true,
        data: {
          providers: providers.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            models: p.models.map((m) => ({
              id: m.id,
              name: m.name,
              displayName: m.displayName,
            })),
          })),
          totalProviders: providers.length,
          totalModels: providers.reduce((sum, p) => sum + p.models.length, 0),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
