// GACA-Core - Universal AI Bus
// Main entry point and exports
// Version 2.0 - Framework-agnostic with dependency injection

import { PrismaClient } from '@prisma/client';
import type { GacaLogger } from './core/interfaces/logger.interface.js';
import type { GacaPersistence } from './core/interfaces/persistence.interface.js';
import { PrismaPersistence } from './core/persistence/prisma.persistence.js';
import { PinoLoggerFactory } from './core/loggers/pino.logger.js';

// ==================== CORE COMPONENTS ====================
export { AIEngine } from './core/AIEngine.js';
export type { AIEngineConfig } from './core/AIEngine.js';
export { GenericAdapter } from './core/GenericAdapter.js';
export { ModelSelector } from './core/ModelSelector.js';
export { RankingService } from './core/RankingService.js';
export { UsageTracker } from './core/UsageTracker.js';

// ==================== INTERFACES ====================
export type { GacaLogger, GacaLoggerFactory } from './core/interfaces/logger.interface.js';
export type {
  GacaPersistence,
  ProviderEntity,
  ModelEntity,
  ModelRankingEntity,
  ModelUsageEntity,
  ProviderUsageEntity,
  FailoverEventEntity,
} from './core/interfaces/persistence.interface.js';

// ==================== LOGGER IMPLEMENTATIONS ====================
export { ConsoleLogger, ConsoleLoggerFactory } from './core/loggers/console.logger.js';
export { PinoLogger, PinoLoggerFactory, createDefaultPinoLogger } from './core/loggers/pino.logger.js';

// ==================== PERSISTENCE IMPLEMENTATIONS ====================
export { PrismaPersistence } from './core/persistence/prisma.persistence.js';

// ==================== TYPES ====================
export * from './core/types.js';

// ==================== PROMPTS ====================
export {
  loadPrompt,
  savePrompt,
  deletePrompt,
  listPrompts,
  clearPromptCache,
  loadPromptWithVariables,
} from './prompts/loader.js';

// ==================== FACTORY FUNCTIONS ====================

/**
 * Create an AIEngine instance with custom logger and persistence
 * This is the recommended way to create an AIEngine for framework integration
 *
 * @example
 * // NestJS integration
 * const engine = createAIEngine({
 *   logger: new NestJsLoggerAdapter('GACA'),
 *   persistence: new PrismaPersistenceAdapter(prismaService),
 * });
 *
 * @example
 * // Express/standalone (uses defaults)
 * const engine = await createAIEngineWithDefaults();
 */
export function createAIEngine(config: {
  logger: GacaLogger;
  persistence: GacaPersistence;
}): InstanceType<typeof import('./core/AIEngine.js').AIEngine> {
  const { AIEngine } = require('./core/AIEngine.js');
  return new AIEngine({
    logger: config.logger,
    persistence: config.persistence,
  });
}

// ==================== SINGLETON INSTANCE (for backwards compatibility) ====================

let engineInstance: InstanceType<typeof import('./core/AIEngine.js').AIEngine> | null = null;
let prismaInstance: PrismaClient | null = null;

/**
 * Initialize GACA-Core with database connection (backwards compatible)
 * For new integrations, prefer createAIEngine() with explicit dependencies
 *
 * @param databaseUrl - Optional database URL (defaults to DATABASE_URL env var)
 * @returns Initialized AIEngine instance
 */
export async function initGacaCore(
  databaseUrl?: string,
): Promise<InstanceType<typeof import('./core/AIEngine.js').AIEngine>> {
  if (engineInstance) {
    return engineInstance;
  }

  // Initialize Prisma
  prismaInstance = new PrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
  });

  await prismaInstance.$connect();

  // Create logger and persistence
  const loggerFactory = new PinoLoggerFactory();
  const logger = loggerFactory.createLogger('GACA');
  const persistence = new PrismaPersistence(prismaInstance);

  // Initialize engine with new interface
  const { AIEngine } = await import('./core/AIEngine.js');
  engineInstance = new AIEngine({
    logger,
    persistence,
  });

  return engineInstance;
}

/**
 * Get the initialized AIEngine instance
 * @throws Error if not initialized
 */
export function getEngine(): InstanceType<typeof import('./core/AIEngine.js').AIEngine> {
  if (!engineInstance) {
    throw new Error('GACA-Core not initialized. Call initGacaCore() first.');
  }
  return engineInstance;
}

/**
 * Get the Prisma client instance
 * @throws Error if not initialized
 */
export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    throw new Error('GACA-Core not initialized. Call initGacaCore() first.');
  }
  return prismaInstance;
}

/**
 * Shutdown GACA-Core and close connections
 */
export async function shutdownGacaCore(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
  engineInstance = null;
}

// Quick helper for simple completions
export async function complete(
  prompt: string,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    providerId?: string;
    modelId?: string;
  },
): Promise<string> {
  const engine = getEngine();

  const response = await engine.complete({
    prompt,
    systemPrompt: options?.systemPrompt,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    providerId: options?.providerId,
    model: options?.modelId,
  });

  return response.content;
}
