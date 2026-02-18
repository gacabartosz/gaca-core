// Ranking Routes - Model ranking endpoints

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AIEngine } from '../../core/AIEngine.js';
import { validateBody, UpdateQualityScoreSchema, UpdateRankingWeightsSchema } from '../../core/validation.js';

export function createRankingRoutes(prisma: PrismaClient, engine: AIEngine): Router {
  const router = Router();

  // GET /api/ranking - Get all model rankings
  router.get('/', async (req: Request, res: Response) => {
    try {
      const rankings = await engine.getRankingService().getAllRankings();
      res.json(rankings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/ranking/:modelId - Get ranking for specific model
  router.get('/:modelId', async (req: Request, res: Response) => {
    try {
      const ranking = await engine.getRankingService().getRanking(req.params.modelId as string);

      if (!ranking) {
        return res.status(404).json({ error: 'Ranking not found for this model' });
      }

      res.json(ranking);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/ranking/recalculate - Recalculate all rankings
  router.post('/recalculate', async (req: Request, res: Response) => {
    try {
      await engine.getRankingService().recalculateAll();
      const rankings = await engine.getRankingService().getAllRankings();
      res.json({ message: 'Rankings recalculated', rankings });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/ranking/:modelId/recalculate - Recalculate ranking for specific model
  router.post('/:modelId/recalculate', async (req: Request, res: Response) => {
    try {
      await engine.getRankingService().recalculateForModel(req.params.modelId as string);
      const ranking = await engine.getRankingService().getRanking(req.params.modelId as string);
      res.json(ranking);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/ranking/:modelId/quality - Update quality score for model
  router.put('/:modelId/quality', validateBody(UpdateQualityScoreSchema), async (req: Request, res: Response) => {
    try {
      const { qualityScore } = req.body;

      await engine.getRankingService().updateQualityScore(req.params.modelId as string, qualityScore);
      const ranking = await engine.getRankingService().getRanking(req.params.modelId as string);

      res.json(ranking);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/ranking/weights - Get current ranking weights
  router.get('/config/weights', async (req: Request, res: Response) => {
    try {
      const weights = engine.getRankingService().getWeights();
      res.json(weights);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/ranking/weights - Update ranking weights
  router.put('/config/weights', validateBody(UpdateRankingWeightsSchema), async (req: Request, res: Response) => {
    try {
      const { successRate, latency, quality } = req.body;

      const weights: Record<string, number> = {};
      if (successRate !== undefined) weights.successRate = successRate;
      if (latency !== undefined) weights.latency = latency;
      if (quality !== undefined) weights.quality = quality;

      engine.getRankingService().setWeights(weights);

      res.json(engine.getRankingService().getWeights());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
