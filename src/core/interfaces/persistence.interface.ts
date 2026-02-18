// GacaPersistence - Framework-agnostic persistence interface
// Allows integration with Prisma, TypeORM, Drizzle, or any other ORM/database

import type {
  ProviderConfig,
  ModelConfig,
  ModelWithRanking,
  ProviderWithModels,
  UsageData,
  FailoverEvent,
  ApiFormat,
} from '../types.js';

// Provider entity from database
export interface ProviderEntity {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  apiKey: string | null;
  apiFormat: string;
  authHeader: string;
  authPrefix: string;
  customHeaders: string | null;
  rateLimitRpm: number | null;
  rateLimitRpd: number | null;
  isEnabled: boolean;
  priority: number;
}

// Model entity from database
export interface ModelEntity {
  id: string;
  providerId: string;
  name: string;
  displayName: string | null;
  rateLimitRpm: number | null;
  rateLimitRpd: number | null;
  costPer1kInput: number;
  costPer1kOutput: number;
  maxTokens: number;
  contextWindow: number;
  isEnabled: boolean;
  isDefault: boolean;
}

// Model ranking entity
export interface ModelRankingEntity {
  modelId: string;
  score: number;
  successRate: number;
  avgLatencyMs: number;
  avgQualityScore: number;
  sampleSize: number;
  lastCalculatedAt: Date;
}

// Model usage entity
export interface ModelUsageEntity {
  modelId: string;
  requestsToday: number;
  requestsThisMinute: number;
  lastRequestAt: Date | null;
  minuteResetAt: Date | null;
  dayResetAt: Date | null;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  totalTokensUsed: number;
}

// Provider usage entity
export interface ProviderUsageEntity {
  providerId: string;
  requestsToday: number;
  requestsThisMinute: number;
  lastRequestAt: Date | null;
  minuteResetAt: Date | null;
  dayResetAt: Date | null;
  totalTokensUsed: number;
  totalCostUsd: number;
}

// Failover event entity
export interface FailoverEventEntity {
  id?: string;
  fromModelId: string | null;
  toModelId: string | null;
  reason: string;
  errorMessage: string | null;
  latencyMs: number | null;
  createdAt?: Date;
}

// Main persistence interface
export interface GacaPersistence {
  // ==================== PROVIDERS ====================

  /** Find provider by ID */
  findProviderById(id: string): Promise<(ProviderEntity & { models: ModelEntity[] }) | null>;

  /** Get all enabled providers with their models */
  getEnabledProvidersWithModels(): Promise<Array<ProviderEntity & {
    models: Array<ModelEntity & { ranking: ModelRankingEntity | null; usage: ModelUsageEntity | null }>;
    usage: ProviderUsageEntity | null;
  }>>;

  // ==================== MODELS ====================

  /** Find model by ID with provider and ranking */
  findModelById(id: string): Promise<(ModelEntity & {
    provider: ProviderEntity & { usage: ProviderUsageEntity | null };
    ranking: ModelRankingEntity | null;
    usage: ModelUsageEntity | null;
  }) | null>;

  /** Get all enabled models */
  getEnabledModels(): Promise<Array<ModelEntity & { usage: ModelUsageEntity | null }>>;

  // ==================== USAGE TRACKING ====================

  /** Get provider usage */
  getProviderUsage(providerId: string): Promise<ProviderUsageEntity | null>;

  /** Upsert provider usage */
  upsertProviderUsage(data: {
    providerId: string;
    incrementRequests: boolean;
    requestsThisMinute?: number;
    tokensUsed?: number;
  }): Promise<void>;

  /** Get model usage */
  getModelUsage(modelId: string): Promise<ModelUsageEntity | null>;

  /** Upsert model usage */
  upsertModelUsage(data: {
    modelId: string;
    success: boolean;
    latencyMs: number;
    tokensUsed?: number;
    requestsThisMinute?: number;
  }): Promise<void>;

  /** Reset daily counters for providers */
  resetProviderDailyCounters(beforeDate: Date): Promise<void>;

  /** Reset daily counters for models */
  resetModelDailyCounters(beforeDate: Date): Promise<void>;

  // ==================== RANKING ====================

  /** Get model ranking */
  getModelRanking(modelId: string): Promise<ModelRankingEntity | null>;

  /** Upsert model ranking */
  upsertModelRanking(data: {
    modelId: string;
    score: number;
    successRate: number;
    avgLatencyMs: number;
    avgQualityScore?: number;
    sampleSize: number;
  }): Promise<void>;

  /** Get all rankings sorted by score */
  getAllRankings(): Promise<Array<ModelRankingEntity & {
    model: ModelEntity & { provider: ProviderEntity };
  }>>;

  // ==================== FAILOVER EVENTS ====================

  /** Log a failover event */
  logFailoverEvent(event: FailoverEventEntity): Promise<void>;

  /** Get recent failover events */
  getFailoverEvents(limit: number): Promise<FailoverEventEntity[]>;
}
