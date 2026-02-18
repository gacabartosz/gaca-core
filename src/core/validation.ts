// Zod validation schemas and Express middleware for GACA-Core

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ============================================
// Completion schemas
// ============================================

export const CompleteRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt is required').max(100000, 'prompt exceeds maximum length of 100,000 characters'),
  systemPrompt: z.string().optional(),
  systemPromptName: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const StreamRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt is required').max(100000, 'prompt exceeds maximum length of 100,000 characters'),
  systemPrompt: z.string().optional(),
  systemPromptName: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
});

// ============================================
// Provider schemas
// ============================================

export const CreateProviderSchema = z.object({
  name: z.string().min(1, 'name is required'),
  slug: z
    .string()
    .min(1, 'slug is required')
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  baseUrl: z.url('baseUrl must be a valid URL'),
  apiKey: z.string().nullable().optional(),
  apiFormat: z.enum(['openai', 'anthropic', 'google', 'custom']).default('openai'),
  authHeader: z.string().default('Authorization'),
  authPrefix: z.string().default('Bearer '),
  customHeaders: z.record(z.string(), z.string()).default({}),
  rateLimitRpm: z.number().int().min(0).nullable().optional(),
  rateLimitRpd: z.number().int().min(0).nullable().optional(),
  priority: z.number().int().min(0).default(100),
  isEnabled: z.boolean().default(true),
});

export const UpdateProviderSchema = CreateProviderSchema.partial();

// ============================================
// Model schemas
// ============================================

export const CreateModelSchema = z.object({
  providerId: z.string().min(1, 'providerId is required'),
  name: z.string().min(1, 'name is required'),
  displayName: z.string().nullable().optional(),
  rateLimitRpm: z.number().int().min(0).nullable().optional(),
  rateLimitRpd: z.number().int().min(0).nullable().optional(),
  costPer1kInput: z.number().min(0).default(0),
  costPer1kOutput: z.number().min(0).default(0),
  maxTokens: z.number().int().min(1).default(4096),
  contextWindow: z.number().int().min(1).default(8192),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export const UpdateModelSchema = CreateModelSchema.partial();

// ============================================
// Ranking schemas
// ============================================

export const UpdateQualityScoreSchema = z.object({
  qualityScore: z.number().min(0).max(1, 'qualityScore must be between 0 and 1'),
});

export const UpdateRankingWeightsSchema = z.object({
  successRate: z.number().min(0).max(1).optional(),
  latency: z.number().min(0).max(1).optional(),
  quality: z.number().min(0).max(1).optional(),
});

// ============================================
// Prompt schemas
// ============================================

export const CreatePromptSchema = z.object({
  name: z
    .string()
    .min(1, 'name is required')
    .regex(/^[a-zA-Z0-9_-]+$/, 'name must only contain alphanumeric characters, hyphens, and underscores'),
  content: z.string().min(1, 'content is required').max(50000, 'content exceeds maximum length of 50,000 characters'),
});

export const UpdatePromptSchema = z.object({
  content: z.string().min(1, 'content is required').max(50000, 'content exceeds maximum length of 50,000 characters'),
});

// ============================================
// Middleware
// ============================================

/**
 * Express middleware that validates req.body against a Zod schema.
 * Returns 400 with structured error details on validation failure.
 */
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }
    // Replace req.body with parsed (and coerced/defaulted) data
    req.body = result.data;
    next();
  };
}
