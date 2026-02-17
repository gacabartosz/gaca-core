// Complete Routes - AI completion endpoints

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AIEngine } from '../../core/AIEngine.js';
import { loadPrompt } from '../../prompts/loader.js';
import { generateRequestId } from '../../core/types.js';
import { validateBody, CompleteRequestSchema, StreamRequestSchema } from '../../core/validation.js';
import { logger } from '../../core/logger.js';

export function createCompleteRoutes(prisma: PrismaClient, engine: AIEngine): Router {
  const router = Router();

  // POST /api/complete - Execute AI completion
  router.post('/', validateBody(CompleteRequestSchema), async (req: Request, res: Response) => {
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

      // Add response metadata headers
      res.set('X-Request-Id', requestId);
      res.set('X-Provider', response.providerName);
      res.set('X-Model', response.model);
      res.set('X-Latency-Ms', String(response.latencyMs));

      // Add rate limit headers
      try {
        const rateInfo = await engine.getRateLimitInfo(response.providerId, response.modelId);

        const effectiveRpm = Math.min(
          rateInfo.providerRpm ?? Infinity,
          rateInfo.modelRpm ?? Infinity
        );
        const effectiveRpd = Math.min(
          rateInfo.providerRpd ?? Infinity,
          rateInfo.modelRpd ?? Infinity
        );
        const usedMinute = Math.max(rateInfo.providerUsedMinute, rateInfo.modelUsedMinute);
        const usedDay = Math.max(rateInfo.providerUsedDay, rateInfo.modelUsedDay);

        if (effectiveRpm !== Infinity) {
          res.set('X-RateLimit-Limit-Minute', String(effectiveRpm));
          res.set('X-RateLimit-Remaining-Minute', String(Math.max(0, effectiveRpm - usedMinute)));
        }
        if (effectiveRpd !== Infinity) {
          res.set('X-RateLimit-Limit-Day', String(effectiveRpd));
          res.set('X-RateLimit-Remaining-Day', String(Math.max(0, effectiveRpd - usedDay)));
        }
      } catch {
        // Non-critical — don't fail the response if header lookup fails
      }

      res.json(response);
    } catch (error: any) {
      logger.error({ requestId, err: error.message }, 'Completion failed');
      res.status(500).json({ error: error.message, requestId });
    }
  });

  // POST /api/complete/stream - SSE streaming completion
  router.post('/stream', validateBody(StreamRequestSchema), async (req: Request, res: Response) => {
    const requestId = generateRequestId();

    try {
      const {
        prompt,
        systemPrompt,
        systemPromptName,
        temperature,
        maxTokens,
      } = req.body;

      let finalSystemPrompt = systemPrompt;
      if (systemPromptName && !systemPrompt) {
        try {
          finalSystemPrompt = loadPrompt(systemPromptName);
        } catch (e) {
          return res.status(400).json({ error: `System prompt not found: ${systemPromptName}`, requestId });
        }
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Request-Id', requestId);
      res.flushHeaders();

      const aiRequest = {
        prompt,
        systemPrompt: finalSystemPrompt,
        temperature,
        maxTokens,
        requestId,
      };

      const response = await engine.completeStream(aiRequest, (token: string) => {
        res.write(`data: ${JSON.stringify({ token, done: false })}\n\n`);
      });

      // Send final event with metadata
      res.write(`data: ${JSON.stringify({
        token: '',
        done: true,
        model: response.model,
        modelId: response.modelId,
        providerId: response.providerId,
        providerName: response.providerName,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
        requestId,
      })}\n\n`);

      res.end();
    } catch (error: any) {
      logger.error({ requestId, err: error.message }, 'Stream failed');

      // If headers already sent, send error as SSE event
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message, done: true, requestId })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: error.message, requestId });
      }
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
