// AIEngine - Main AI completion engine with failover and ranking

import { PrismaClient } from '@prisma/client';
import { AIRequest, AIResponse, FailoverEvent, ProviderConfig, ModelConfig, TestResult } from './types.js';
import { GenericAdapter } from './GenericAdapter.js';
import { ModelSelector } from './ModelSelector.js';
import { RankingService } from './RankingService.js';
import { UsageTracker } from './UsageTracker.js';

const MAX_FAILOVER_ATTEMPTS = 30;

export class AIEngine {
  private prisma: PrismaClient;
  private modelSelector: ModelSelector;
  private rankingService: RankingService;
  private usageTracker: UsageTracker;
  private adapterCache: Map<string, GenericAdapter> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.usageTracker = new UsageTracker(prisma);
    this.modelSelector = new ModelSelector(prisma, this.usageTracker);
    this.rankingService = new RankingService(prisma);
  }

  // Main completion method with automatic model selection and failover
  async complete(request: AIRequest): Promise<AIResponse> {
    const excludeModelIds: string[] = [];
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts < MAX_FAILOVER_ATTEMPTS) {
      attempts++;

      // Select best available model
      const selection = await this.modelSelector.getNextModel(excludeModelIds);

      if (!selection) {
        break;
      }

      const { model, provider } = selection;
      excludeModelIds.push(model.id);

      try {
        console.log(`[AIEngine] Trying ${provider.name} → ${model.displayName || model.name}...`);

        const adapter = this.getAdapter(provider);
        const response = await adapter.complete(model, request);

        // Track successful usage
        await this.usageTracker.track({
          providerId: provider.id,
          modelId: model.id,
          success: true,
          latencyMs: response.latencyMs,
          tokensUsed: response.tokensUsed,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });

        // Maybe recalculate ranking
        await this.rankingService.maybeRecalculate(model.id);

        console.log(`[AIEngine] Success with ${provider.name}/${model.name} in ${response.latencyMs}ms`);

        return response;
      } catch (error: any) {
        lastError = error;

        // Track failed usage
        await this.usageTracker.track({
          providerId: provider.id,
          modelId: model.id,
          success: false,
          latencyMs: 0,
        });

        // Log failover
        const reason = this.determineFailureReason(error);
        await this.logFailover({
          fromModelId: excludeModelIds.length > 1 ? excludeModelIds[excludeModelIds.length - 2] : null,
          toModelId: model.id,
          reason,
          errorMessage: error.message,
        });

        console.error(`[AIEngine] ${provider.name}/${model.name} failed (${reason}):`, error.message?.substring(0, 100));
      }
    }

    throw new Error(
      `All AI providers failed after ${attempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  // Complete with specific provider
  async completeWithProvider(providerId: string, request: AIRequest): Promise<AIResponse> {
    const selection = await this.modelSelector.selectBestModel(providerId);

    if (!selection) {
      throw new Error(`Provider ${providerId} is not available`);
    }

    const { model, provider } = selection;
    const adapter = this.getAdapter(provider);

    try {
      const response = await adapter.complete(model, request);

      await this.usageTracker.track({
        providerId: provider.id,
        modelId: model.id,
        success: true,
        latencyMs: response.latencyMs,
        tokensUsed: response.tokensUsed,
      });

      await this.rankingService.maybeRecalculate(model.id);

      return response;
    } catch (error: any) {
      await this.usageTracker.track({
        providerId: provider.id,
        modelId: model.id,
        success: false,
        latencyMs: 0,
      });

      throw error;
    }
  }

  // Complete with specific model
  async completeWithModel(modelId: string, request: AIRequest): Promise<AIResponse> {
    const selection = await this.modelSelector.selectBestModel(undefined, modelId);

    if (!selection) {
      throw new Error(`Model ${modelId} is not available`);
    }

    const { model, provider } = selection;
    const adapter = this.getAdapter(provider);

    try {
      const response = await adapter.complete(model, request);

      await this.usageTracker.track({
        providerId: provider.id,
        modelId: model.id,
        success: true,
        latencyMs: response.latencyMs,
        tokensUsed: response.tokensUsed,
      });

      await this.rankingService.maybeRecalculate(model.id);

      return response;
    } catch (error: any) {
      await this.usageTracker.track({
        providerId: provider.id,
        modelId: model.id,
        success: false,
        latencyMs: 0,
      });

      throw error;
    }
  }

  // Test a provider connection
  async testProvider(providerId: string): Promise<TestResult> {
    const provider = await this.prisma.aIProvider.findUnique({
      where: { id: providerId },
      include: {
        models: { where: { isDefault: true }, take: 1 },
      },
    });

    if (!provider) {
      return { success: false, error: 'Provider not found' };
    }

    if (!provider.apiKey) {
      return { success: false, error: 'No API key configured' };
    }

    const providerConfig: ProviderConfig = {
      id: provider.id,
      name: provider.name,
      slug: provider.slug,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      apiFormat: provider.apiFormat as any,
      authHeader: provider.authHeader,
      authPrefix: provider.authPrefix,
      customHeaders: JSON.parse(provider.customHeaders || '{}'),
      rateLimitRpm: provider.rateLimitRpm,
      rateLimitRpd: provider.rateLimitRpd,
      isEnabled: provider.isEnabled,
      priority: provider.priority,
    };

    const defaultModel = provider.models[0];
    const modelConfig: ModelConfig | undefined = defaultModel
      ? {
          id: defaultModel.id,
          providerId: defaultModel.providerId,
          name: defaultModel.name,
          displayName: defaultModel.displayName,
          rateLimitRpm: defaultModel.rateLimitRpm,
          rateLimitRpd: defaultModel.rateLimitRpd,
          costPer1kInput: defaultModel.costPer1kInput,
          costPer1kOutput: defaultModel.costPer1kOutput,
          maxTokens: defaultModel.maxTokens,
          contextWindow: defaultModel.contextWindow,
          isEnabled: defaultModel.isEnabled,
          isDefault: defaultModel.isDefault,
        }
      : undefined;

    const adapter = new GenericAdapter(providerConfig);
    return adapter.testConnection(modelConfig);
  }

  // Get ranking service for external use
  getRankingService(): RankingService {
    return this.rankingService;
  }

  // Get usage tracker for external use
  getUsageTracker(): UsageTracker {
    return this.usageTracker;
  }

  // Get model selector for external use
  getModelSelector(): ModelSelector {
    return this.modelSelector;
  }

  // Get failover events
  async getFailoverEvents(limit: number = 50): Promise<any[]> {
    return this.prisma.aIFailoverEvent.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Clear adapter cache (after provider config changes)
  clearAdapterCache(providerId?: string): void {
    if (providerId) {
      this.adapterCache.delete(providerId);
    } else {
      this.adapterCache.clear();
    }
  }

  private getAdapter(provider: ProviderConfig): GenericAdapter {
    if (!this.adapterCache.has(provider.id)) {
      this.adapterCache.set(provider.id, new GenericAdapter(provider));
    }
    return this.adapterCache.get(provider.id)!;
  }

  private determineFailureReason(error: any): FailoverEvent['reason'] {
    const msg = error.message?.toLowerCase() || '';

    if (msg.includes('429') || msg.includes('rate') || msg.includes('too many')) {
      return 'rate_limit';
    }
    if (msg.includes('quota') || msg.includes('billing') || msg.includes('insufficient')) {
      return 'quota_exceeded';
    }
    if (msg.includes('timeout') || error.name === 'AbortError') {
      return 'timeout';
    }
    if (msg.includes('not found') || msg.includes('does not exist')) {
      return 'model_not_found';
    }

    return 'error';
  }

  private async logFailover(event: FailoverEvent): Promise<void> {
    try {
      await this.prisma.aIFailoverEvent.create({
        data: {
          fromModelId: event.fromModelId,
          toModelId: event.toModelId,
          reason: event.reason,
          errorMessage: event.errorMessage,
          latencyMs: event.latencyMs,
        },
      });
    } catch (error) {
      console.error('[AIEngine] Failed to log failover:', error);
    }
  }
}
