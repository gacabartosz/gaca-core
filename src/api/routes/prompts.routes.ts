// Prompts Routes - CRUD operations for prompt templates

import { Router, Request, Response } from 'express';
import { loadPrompt, savePrompt, deletePrompt, listPrompts } from '../../prompts/loader.js';
import { validateBody, CreatePromptSchema, UpdatePromptSchema } from '../../core/validation.js';

interface NameParams {
  name: string;
}

export function createPromptRoutes(): Router {
  const router = Router();

  // GET /api/prompts - List all prompts
  router.get('/', async (req: Request, res: Response) => {
    try {
      const prompts = listPrompts();
      res.json(prompts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/prompts/:name - Get prompt content
  router.get('/:name', async (req: Request<NameParams>, res: Response) => {
    try {
      const content = loadPrompt(req.params.name, false);
      res.json({ name: req.params.name, content });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Prompt not found' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/prompts - Create/update custom prompt
  router.post('/', validateBody(CreatePromptSchema), async (req: Request, res: Response) => {
    try {
      const { name, content } = req.body;

      // Don't allow overwriting default prompts
      const existing = listPrompts();
      const isDefault = existing.find((p) => p.name === name && !p.isCustom);

      if (isDefault) {
        return res.status(400).json({ error: 'Cannot overwrite default prompts. Use a different name.' });
      }

      savePrompt(name, content);
      res.status(201).json({ name, content, isCustom: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/prompts/:name - Update custom prompt
  router.put('/:name', validateBody(UpdatePromptSchema), async (req: Request<NameParams>, res: Response) => {
    try {
      const { content } = req.body;

      // Check if it's a default prompt
      const existing = listPrompts();
      const isDefault = existing.find((p) => p.name === req.params.name && !p.isCustom);

      if (isDefault) {
        return res.status(400).json({ error: 'Cannot modify default prompts' });
      }

      savePrompt(req.params.name, content);
      res.json({ name: req.params.name, content, isCustom: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/prompts/:name - Delete custom prompt
  router.delete('/:name', async (req: Request<NameParams>, res: Response) => {
    try {
      // Check if it's a default prompt
      const existing = listPrompts();
      const isDefault = existing.find((p) => p.name === req.params.name && !p.isCustom);

      if (isDefault) {
        return res.status(400).json({ error: 'Cannot delete default prompts' });
      }

      const deleted = deletePrompt(req.params.name);

      if (!deleted) {
        return res.status(404).json({ error: 'Prompt not found' });
      }

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
