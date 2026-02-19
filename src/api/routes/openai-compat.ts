// OpenAI-compatible proxy endpoint for gaca-core
// Allows OpenClaw and other OpenAI-compatible clients to use gaca-core as a provider
// Endpoint: POST /v1/chat/completions (OpenAI format)

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AIEngine } from '../../core/AIEngine.js';
import { CompletionMessage } from '../../core/types.js';
import { logger } from '../../core/logger.js';

interface OpenAIChatRequest {
  model?: string;
  messages: CompletionMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
}

export function createOpenAICompatRoutes(prisma: PrismaClient, engine: AIEngine): Router {
  const router = Router();

  // GET /v1/models - List available models (OpenAI format)
  router.get('/models', async (req: Request, res: Response) => {
    try {
      const available = await engine.getModelSelector().getAvailableModels();

      const models = available.map((item) => ({
        id: `${item.provider.slug}/${item.model.name}`,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: item.provider.name,
      }));

      models.unshift({
        id: 'gacacore-auto',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'gaca-core',
      });

      res.json({ object: 'list', data: models });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message, type: 'server_error' } });
    }
  });

  // POST /v1/chat/completions - OpenAI-compatible chat completion
  router.post('/chat/completions', async (req: Request, res: Response) => {
    try {
      const body = req.body as OpenAIChatRequest;

      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return res.status(400).json({
          error: { message: 'messages is required and must be a non-empty array', type: 'invalid_request_error' },
        });
      }

      // Get completion from engine
      const response = await engine.complete({
        messages: body.messages,
        temperature: body.temperature,
        maxTokens: body.max_tokens,
        topP: body.top_p,
        frequencyPenalty: body.frequency_penalty,
        presencePenalty: body.presence_penalty,
        stop: body.stop,
      });

      logger.info({ model: response.model, provider: response.providerName, latencyMs: response.latencyMs }, 'OpenAI-compat completion');

      const completionId = `chatcmpl-gaca-${response.id || Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      // SSE streaming mode — wrap full response in OpenAI SSE format
      if (body.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send content as a single chunk
        const chunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: response.model,
          choices: [{
            index: 0,
            delta: { role: 'assistant', content: response.content },
            finish_reason: null,
          }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);

        // Send stop chunk
        const stopChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: response.model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: response.usage?.promptTokens || 0,
            completion_tokens: response.usage?.completionTokens || 0,
            total_tokens: response.usage?.totalTokens || 0,
          },
        };
        res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Non-streaming: standard JSON response
      res.json({
        id: completionId,
        object: 'chat.completion',
        created,
        model: response.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: response.content,
            },
            finish_reason: response.finishReason || 'stop',
          },
        ],
        usage: {
          prompt_tokens: response.usage?.promptTokens || 0,
          completion_tokens: response.usage?.completionTokens || 0,
          total_tokens: response.usage?.totalTokens || 0,
        },
        _gacacore: {
          providerId: response.providerId,
          providerName: response.providerName,
          modelId: response.modelId,
          latencyMs: response.latencyMs,
          cost: response.cost,
        },
      });
    } catch (error: any) {
      logger.error({ err: error }, 'OpenAI-compat completion failed');
      res.status(500).json({
        error: { message: error.message, type: 'server_error' },
      });
    }
  });

  return router;
}
