// GACA-Core - Universal AI Bus
// Main entry point and exports

import { PrismaClient } from '@prisma/client';

// Core components
export { AIEngine } from './core/AIEngine.js';
export { GenericAdapter } from './core/GenericAdapter.js';
export { ModelSelector } from './core/ModelSelector.js';
export { RankingService } from './core/RankingService.js';
export { UsageTracker } from './core/UsageTracker.js';

// Types
export * from './core/types.js';

// Prompts
export {
  loadPrompt,
  savePrompt,
  deletePrompt,
  listPrompts,
  clearPromptCache,
  loadPromptWithVariables,
} from './prompts/loader.js';

// Singleton instance
let engineInstance: InstanceType<typeof import('./core/AIEngine.js').AIEngine> | null = null;
let prismaInstance: PrismaClient | null = null;

/**
 * Initialize GACA-Core with database connection
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

  // Initialize engine
  const { AIEngine } = await import('./core/AIEngine.js');
  engineInstance = new AIEngine(prismaInstance);

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
