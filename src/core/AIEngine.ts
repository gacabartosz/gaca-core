// AIEngine - Main AI completion engine with failover and ranking
// Refactored to use GacaLogger and GacaPersistence interfaces

import type { GacaLogger } from './interfaces/logger.interface.js';
import type { GacaPersistence, ProviderEntity, ModelEntity } from './interfaces/persistence.interface.js';
import {
  AIRequest,
  AIResponse,
  FailoverEvent,
  ProviderConfig,
  ModelConfig,
  TestResult,
  generateRequestId,
  ApiFormat,
} from './types.js';
import { GenericAdapter } from './GenericAdapter.js';
import { ModelSelector } from './ModelSelector.js';
import { RankingService } from './RankingService.js';
import { UsageTracker } from './UsageTracker.js';

const MAX_FAILOVER_ATTEMPTS = 30;

export interface AIEngineConfig {
  persistence: GacaPersistence;
  logger: GacaLogger;
}

export class AIEngine {
  private persistence: GacaPersistence;
  private logger: GacaLogger;
  private modelSelector: ModelSelector;
  private rankingService: RankingService;
  private usageTracker: UsageTracker;
  private adapterCache: Map<string, GenericAdapter> = new Map();

  constructor(config: AIEngineConfig) {
    this.persistence = config.persistence;
    this.logger = config.logger;
    this.usageTracker = new UsageTracker(config.persistence, config.logger);
    this.modelSelector = new ModelSelector(config.persistence, this.usageTracker);
    this.rankingService = new RankingService(config.persistence, config.logger);
  }

  // Main completion method with automatic model selection and failover
  async complete(request: AIRequest): Promise<AIResponse> {
    const requestId = request.requestId || generateRequestId();
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
      const modelLabel = `${provider.name}/${model.displayName || model.name}`;
      excludeModelIds.push(model.id);

      try {
        this.logger.info('Attempting completion', { requestId, attempt: attempts, model: modelLabel });

        const adapter = this.getAdapter(provider);
        const response = await adapter.complete(model, { ...request, requestId });

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

        this.logger.info('Completion OK', { requestId, model: modelLabel, latencyMs: response.latencyMs });

        return { ...response, requestId };
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

        this.logger.warn('Completion failed, failing over', {
          requestId,
          model: modelLabel,
          reason,
          err: error.message?.substring(0, 150),
        });
      }
    }

    throw new Error(
      `[${requestId}] All AI providers failed after ${attempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`,
    );
  }

  // Complete with specific provider
  async completeWithProvider(providerId: string, request: AIRequest): Promise<AIResponse> {
    const requestId = request.requestId || generateRequestId();
    const selection = await this.modelSelector.selectBestModel(providerId);

    if (!selection) {
      throw new Error(`[${requestId}] Provider ${providerId} is not available or has no enabled models`);
    }

    const { model, provider } = selection;
    const modelLabel = `${provider.name}/${model.displayName || model.name}`;
    const adapter = this.getAdapter(provider);

    try {
      this.logger.info('Using model', { requestId, model: modelLabel });
      const response = await adapter.complete(model, { ...request, requestId });

      await this.usageTracker.track({
        providerId: provider.id,
        modelId: model.id,
        success: true,
        latencyMs: response.latencyMs,
        tokensUsed: response.tokensUsed,
      });

      await this.rankingService.maybeRecalculate(model.id);

      return { ...response, requestId };
    } catch (error: any) {
      await this.usageTracker.track({
        providerId: provider.id,
        modelId: model.id,
        success: false,
        latencyMs: 0,
      });

      throw new Error(`[${requestId}] ${modelLabel} failed: ${error.message}`);
    }
  }

  // Complete with specific model
  async completeWithModel(modelId: string, request: AIRequest): Promise<AIResponse> {
    const requestId = request.requestId || generateRequestId();
    const selection = await this.modelSelector.selectBestModel(undefined, modelId);

    if (!selection) {
      throw new Error(`[${requestId}] Model ${modelId} is not available or is disabled`);
    }

    const { model, provider } = selection;
    const modelLabel = `${provider.name}/${model.displayName || model.name}`;
    const adapter = this.getAdapter(provider);

    try {
      this.logger.info('Using model', { requestId, model: modelLabel });
      const response = await adapter.complete(model, { ...request, requestId });

      await this.usageTracker.track({
        providerId: provider.id,
        modelId: model.id,
        success: true,
        latencyMs: response.latencyMs,
        tokensUsed: response.tokensUsed,
      });

      await this.rankingService.maybeRecalculate(model.id);

      return { ...response, requestId };
    } catch (error: any) {
      await this.usageTracker.track({
        providerId: provider.id,
        modelId: model.id,
        success: false,
        latencyMs: 0,
      });

      throw new Error(`[${requestId}] ${modelLabel} failed: ${error.message}`);
    }
  }

  // Streaming completion with automatic model selection and failover
  async completeStream(request: AIRequest, onToken: (token: string) => void): Promise<AIResponse> {
    const requestId = request.requestId || generateRequestId();
    const excludeModelIds: string[] = [];
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts < MAX_FAILOVER_ATTEMPTS) {
      attempts++;

      const selection = await this.modelSelector.getNextModel(excludeModelIds);
      if (!selection) break;

      const { model, provider } = selection;
      const modelLabel = `${provider.name}/${model.displayName || model.name}`;
      excludeModelIds.push(model.id);

      try {
        this.logger.info('Stream attempt', { requestId, attempt: attempts, model: modelLabel });

        const adapter = this.getAdapter(provider);
        const response = await adapter.completeStream(model, { ...request, requestId }, onToken);

        await this.usageTracker.track({
          providerId: provider.id,
          modelId: model.id,
          success: true,
          latencyMs: response.latencyMs,
          tokensUsed: response.tokensUsed,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });

        await this.rankingService.maybeRecalculate(model.id);

        this.logger.info('Stream OK', { requestId, model: modelLabel, latencyMs: response.latencyMs });
        return { ...response, requestId };
      } catch (error: any) {
        lastError = error;

        await this.usageTracker.track({
          providerId: provider.id,
          modelId: model.id,
          success: false,
          latencyMs: 0,
        });

        const reason = this.determineFailureReason(error);
        await this.logFailover({
          fromModelId: excludeModelIds.length > 1 ? excludeModelIds[excludeModelIds.length - 2] : null,
          toModelId: model.id,
          reason,
          errorMessage: error.message,
        });

        this.logger.warn('Stream failed, failing over', {
          requestId,
          model: modelLabel,
          reason,
          err: error.message?.substring(0, 150),
        });
      }
    }

    throw new Error(
      `[${requestId}] All AI providers failed streaming after ${attempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`,
    );
  }

  // Test a provider connection
  async testProvider(providerId: string): Promise<TestResult> {
    const provider = await this.persistence.findProviderById(providerId);

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
      apiFormat: provider.apiFormat as ApiFormat,
      authHeader: provider.authHeader,
      authPrefix: provider.authPrefix,
      customHeaders: JSON.parse(provider.customHeaders || '{}'),
      rateLimitRpm: provider.rateLimitRpm,
      rateLimitRpd: provider.rateLimitRpd,
      isEnabled: provider.isEnabled,
      priority: provider.priority,
    };

    const defaultModel = provider.models.find(m => m.isDefault) || provider.models[0];
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
    return this.persistence.getFailoverEvents(limit);
  }

  // Get rate limit info for a provider/model after a request
  async getRateLimitInfo(
    providerId: string,
    modelId: string,
  ): Promise<{
    providerRpm: number | null;
    providerRpd: number | null;
    modelRpm: number | null;
    modelRpd: number | null;
    providerUsedMinute: number;
    providerUsedDay: number;
    modelUsedMinute: number;
    modelUsedDay: number;
  }> {
    const providers = await this.persistence.getEnabledProvidersWithModels();
    const provider = providers.find(p => p.id === providerId);
    const model = provider?.models.find(m => m.id === modelId);

    const providerStats = this.usageTracker.getProviderStats(providerId);
    const modelStats = this.usageTracker.getModelStats(modelId);

    return {
      providerRpm: provider?.rateLimitRpm ?? null,
      providerRpd: provider?.rateLimitRpd ?? null,
      modelRpm: model?.rateLimitRpm ?? null,
      modelRpd: model?.rateLimitRpd ?? null,
      providerUsedMinute: providerStats?.requestsThisMinute ?? 0,
      providerUsedDay: providerStats?.requestsToday ?? 0,
      modelUsedMinute: modelStats?.requestsThisMinute ?? 0,
      modelUsedDay: modelStats?.requestsToday ?? 0,
    };
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
      await this.persistence.logFailoverEvent({
        fromModelId: event.fromModelId ?? null,
        toModelId: event.toModelId ?? null,
        reason: event.reason,
        errorMessage: event.errorMessage || null,
        latencyMs: event.latencyMs || null,
      });
    } catch (error) {
      this.logger.error('Failed to log failover', { err: String(error) });
    }
  }
}
