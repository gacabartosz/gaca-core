// ModelSelector - Selects the best available model based on ranking and limits
// Refactored to use GacaPersistence interface

import type { GacaPersistence, ProviderEntity, ModelEntity, ModelRankingEntity, ModelUsageEntity, ProviderUsageEntity } from './interfaces/persistence.interface.js';
import { ModelWithRanking, ProviderWithModels, ApiFormat } from './types.js';
import { UsageTracker } from './UsageTracker.js';

export class ModelSelector {
  private persistence: GacaPersistence;
  private usageTracker: UsageTracker;

  constructor(persistence: GacaPersistence, usageTracker: UsageTracker) {
    this.persistence = persistence;
    this.usageTracker = usageTracker;
  }

  // Select the best available model
  async selectBestModel(
    preferredProviderId?: string,
    preferredModelId?: string,
  ): Promise<{
    model: ModelWithRanking;
    provider: ProviderWithModels;
  } | null> {
    // If specific model requested, try it first
    if (preferredModelId) {
      const result = await this.trySpecificModel(preferredModelId);
      if (result) return result;
    }

    // If specific provider requested, try its models
    if (preferredProviderId) {
      const result = await this.selectFromProvider(preferredProviderId);
      if (result) return result;
    }

    // Otherwise, select best from all available
    return this.selectFromAll();
  }

  // Get all available models sorted by ranking
  async getAvailableModels(): Promise<
    Array<{
      model: ModelWithRanking;
      provider: ProviderWithModels;
    }>
  > {
    const providers = await this.getProvidersWithModels();
    const available: Array<{ model: ModelWithRanking; provider: ProviderWithModels }> = [];

    for (const provider of providers) {
      if (!provider.isEnabled || !provider.apiKey) continue;

      // Check provider limits
      if (!this.usageTracker.canUseProvider(provider.id, provider.rateLimitRpm, provider.rateLimitRpd)) {
        continue;
      }

      for (const model of provider.models) {
        if (!model.isEnabled) continue;

        // Check model limits
        if (!this.usageTracker.canUseModel(model.id, model.rateLimitRpm, model.rateLimitRpd)) {
          continue;
        }

        available.push({ model, provider });
      }
    }

    // Sort by ranking score (descending), then by provider priority
    available.sort((a, b) => {
      const scoreA = a.model.ranking?.score ?? 0;
      const scoreB = b.model.ranking?.score ?? 0;

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher score first
      }

      // If scores equal, prefer default models
      if (a.model.isDefault && !b.model.isDefault) return -1;
      if (!a.model.isDefault && b.model.isDefault) return 1;

      // Then by provider priority
      return a.provider.priority - b.provider.priority;
    });

    return available;
  }

  // Get next available model (for failover)
  async getNextModel(excludeModelIds: string[]): Promise<{
    model: ModelWithRanking;
    provider: ProviderWithModels;
  } | null> {
    const available = await this.getAvailableModels();

    for (const item of available) {
      if (!excludeModelIds.includes(item.model.id)) {
        return item;
      }
    }

    return null;
  }

  private async trySpecificModel(modelId: string): Promise<{
    model: ModelWithRanking;
    provider: ProviderWithModels;
  } | null> {
    // Support UUID, "provider_slug/model_name", and "provider_slug:model_name" formats
    let model;
    if (modelId.match(/^[0-9a-f]{8}-/)) {
      // UUID format
      model = await this.persistence.findModelById(modelId);
    } else {
      // Parse provider_slug/model_name or provider_slug:model_name
      let providerSlug: string;
      let modelName: string;
      const colonIdx = modelId.indexOf(':');
      const slashIdx = modelId.indexOf('/');
      if (colonIdx > 0 && (slashIdx < 0 || colonIdx < slashIdx)) {
        // "groq:llama-3.3-70b-versatile" format (OpenClaw style)
        providerSlug = modelId.substring(0, colonIdx);
        modelName = modelId.substring(colonIdx + 1);
      } else if (slashIdx > 0) {
        // "groq/llama-3.3-70b-versatile" format (native gaca-core style)
        providerSlug = modelId.substring(0, slashIdx);
        modelName = modelId.substring(slashIdx + 1);
      } else {
        // Unknown format, try as UUID
        model = await this.persistence.findModelById(modelId);
        providerSlug = '';
        modelName = '';
      }
      if (!model && providerSlug && modelName) {
        model = await this.persistence.findModelByProviderAndName(providerSlug, modelName);
      }
    }

    if (!model || !model.isEnabled || !model.provider.isEnabled || !model.provider.apiKey) {
      return null;
    }

    // Check limits
    if (
      !this.usageTracker.canUseProvider(model.provider.id, model.provider.rateLimitRpm, model.provider.rateLimitRpd)
    ) {
      return null;
    }

    if (!this.usageTracker.canUseModel(model.id, model.rateLimitRpm, model.rateLimitRpd)) {
      return null;
    }

    const provider = this.formatProvider({ ...model.provider, models: [] });
    const formattedModel = this.formatModel(model);

    return { model: formattedModel, provider };
  }

  private async selectFromProvider(providerId: string): Promise<{
    model: ModelWithRanking;
    provider: ProviderWithModels;
  } | null> {
    const providers = await this.persistence.getEnabledProvidersWithModels();
    const provider = providers.find(p => p.id === providerId);

    if (!provider || !provider.isEnabled || !provider.apiKey) {
      return null;
    }

    // Check provider limits
    if (!this.usageTracker.canUseProvider(provider.id, provider.rateLimitRpm, provider.rateLimitRpd)) {
      return null;
    }

    const formattedProvider = this.formatProvider(provider);

    // Find first available model (sorted by isDefault desc)
    const sortedModels = [...provider.models].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return 0;
    });

    for (const model of sortedModels) {
      if (!this.usageTracker.canUseModel(model.id, model.rateLimitRpm, model.rateLimitRpd)) {
        continue;
      }

      return {
        model: this.formatModel(model),
        provider: formattedProvider,
      };
    }

    return null;
  }

  private async selectFromAll(): Promise<{
    model: ModelWithRanking;
    provider: ProviderWithModels;
  } | null> {
    const available = await this.getAvailableModels();
    return available[0] || null;
  }

  private async getProvidersWithModels(): Promise<ProviderWithModels[]> {
    const providers = await this.persistence.getEnabledProvidersWithModels();
    return providers.map((p) => this.formatProvider(p));
  }

  private formatProvider(provider: ProviderEntity & {
    models: Array<ModelEntity & { ranking: ModelRankingEntity | null; usage: ModelUsageEntity | null }>;
    usage?: ProviderUsageEntity | null;
  }): ProviderWithModels {
    return {
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
      models: (provider.models || []).map((m) => this.formatModel(m)),
      usage: provider.usage
        ? {
            requestsToday: provider.usage.requestsToday,
            requestsThisMinute: provider.usage.requestsThisMinute,
            totalTokensUsed: provider.usage.totalTokensUsed,
            totalCostUsd: provider.usage.totalCostUsd,
          }
        : null,
    };
  }

  private formatModel(model: ModelEntity & { ranking?: ModelRankingEntity | null; usage?: ModelUsageEntity | null }): ModelWithRanking {
    return {
      id: model.id,
      providerId: model.providerId,
      name: model.name,
      displayName: model.displayName,
      rateLimitRpm: model.rateLimitRpm,
      rateLimitRpd: model.rateLimitRpd,
      costPer1kInput: model.costPer1kInput,
      costPer1kOutput: model.costPer1kOutput,
      maxTokens: model.maxTokens,
      contextWindow: model.contextWindow,
      isEnabled: model.isEnabled,
      isDefault: model.isDefault,
      ranking: model.ranking
        ? {
            score: model.ranking.score,
            successRate: model.ranking.successRate,
            avgLatencyMs: model.ranking.avgLatencyMs,
            sampleSize: model.ranking.sampleSize,
          }
        : null,
      usage: model.usage
        ? {
            requestsToday: model.usage.requestsToday,
            requestsThisMinute: model.usage.requestsThisMinute,
            totalCalls: model.usage.totalCalls,
            successCount: model.usage.successCount,
            failureCount: model.usage.failureCount,
          }
        : null,
    };
  }
}
