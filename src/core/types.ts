// Core types for GACA-Core Universal AI Bus

export type ApiFormat = 'openai' | 'anthropic' | 'google' | 'custom';

// Generate a short unique request ID for tracking
export function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `req_${ts}_${rand}`;
}

// Request to AI completion
export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;          // Optional - will use best available
  providerId?: string;     // Optional - will select best provider
  temperature?: number;
  maxTokens?: number;
  customBody?: Record<string, unknown>;  // For custom API formats
  requestId?: string;      // Unique request ID for tracking/debugging
}

// Response from AI completion
export interface AIResponse {
  content: string;
  model: string;
  modelId: string;
  providerId: string;
  providerName: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  finishReason?: string;
  cost?: number;           // Estimated cost in USD
  requestId?: string;      // Request ID for tracking/debugging
}

// Provider configuration (from database)
export interface ProviderConfig {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  apiKey: string | null;
  apiFormat: ApiFormat;
  authHeader: string;
  authPrefix: string;
  customHeaders: Record<string, string>;
  rateLimitRpm: number | null;
  rateLimitRpd: number | null;
  isEnabled: boolean;
  priority: number;
}

// Model configuration (from database)
export interface ModelConfig {
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

// Model with ranking info
export interface ModelWithRanking extends ModelConfig {
  ranking: {
    score: number;
    successRate: number;
    avgLatencyMs: number;
    sampleSize: number;
  } | null;
  usage: {
    requestsToday: number;
    requestsThisMinute: number;
    totalCalls: number;
    successCount: number;
    failureCount: number;
  } | null;
}

// Provider with models
export interface ProviderWithModels extends ProviderConfig {
  models: ModelWithRanking[];
  usage: {
    requestsToday: number;
    requestsThisMinute: number;
    totalTokensUsed: number;
    totalCostUsd: number;
  } | null;
}

// Test result
export interface TestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
  model?: string;
}

// Usage tracking data
export interface UsageData {
  providerId: string;
  modelId: string;
  success: boolean;
  latencyMs: number;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
}

// Failover event
export interface FailoverEvent {
  fromModelId: string | null;
  toModelId: string | null;
  reason: 'rate_limit' | 'timeout' | 'error' | 'quality' | 'model_not_found' | 'quota_exceeded';
  errorMessage?: string;
  latencyMs?: number;
}

// Ranking calculation params
export interface RankingWeights {
  successRate: number;      // Default: 0.4
  latency: number;          // Default: 0.3
  quality: number;          // Default: 0.3
}

// Default provider configurations for seeding
export interface DefaultProviderConfig {
  name: string;
  slug: string;
  baseUrl: string;
  apiFormat: ApiFormat;
  authHeader: string;
  authPrefix: string;
  rateLimitRpm: number;
  rateLimitRpd: number;
  priority: number;
  models: Array<{
    name: string;
    displayName: string;
    rateLimitRpm?: number;
    rateLimitRpd?: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
    maxTokens?: number;
    contextWindow?: number;
    isDefault?: boolean;
  }>;
}

// Default providers with their models
// This is the SOURCE OF TRUTH — sync-providers.ts uses this to update the database
export const DEFAULT_PROVIDERS: DefaultProviderConfig[] = [
  // ============================================
  // FREE TIER PROVIDERS (Priority 1-8)
  // ============================================
  {
    name: 'Groq',
    slug: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 30,
    rateLimitRpd: 14400,
    priority: 1,
    models: [
      { name: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B', rateLimitRpd: 14400, isDefault: true },
      { name: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B', rateLimitRpd: 1000 },
      { name: 'meta-llama/llama-4-maverick-17b-128e-instruct', displayName: 'Llama 4 Maverick 17B', rateLimitRpd: 1000 },
      { name: 'meta-llama/llama-4-scout-17b-16e-instruct', displayName: 'Llama 4 Scout 17B', rateLimitRpd: 1000 },
      { name: 'qwen/qwen3-32b', displayName: 'Qwen 3 32B', rateLimitRpd: 1000 },
      { name: 'moonshotai/kimi-k2-instruct', displayName: 'Kimi K2', rateLimitRpd: 1000 },
      { name: 'openai/gpt-oss-120b', displayName: 'GPT-OSS 120B', rateLimitRpd: 1000 },
      { name: 'openai/gpt-oss-20b', displayName: 'GPT-OSS 20B', rateLimitRpd: 1000 },
    ],
  },
  {
    name: 'Cerebras',
    slug: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 30,
    rateLimitRpd: 14400,
    priority: 2,
    models: [
      { name: 'llama3.1-8b', displayName: 'Llama 3.1 8B', rateLimitRpd: 14400, isDefault: true },
      { name: 'qwen-3-235b-a22b-instruct-2507', displayName: 'Qwen 3 235B', rateLimitRpd: 14400 },
      { name: 'gpt-oss-120b', displayName: 'GPT-OSS 120B', rateLimitRpd: 14400 },
      { name: 'zai-glm-4.7', displayName: 'ZAI GLM 4.7', rateLimitRpd: 14400 },
    ],
  },
  {
    name: 'Google AI Studio',
    slug: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    apiFormat: 'google',
    authHeader: '',
    authPrefix: '',
    rateLimitRpm: 30,
    rateLimitRpd: 14400,
    priority: 3,
    models: [
      { name: 'gemma-3-27b-it', displayName: 'Gemma 3 27B', rateLimitRpd: 14400, isDefault: true },
      { name: 'gemma-3-12b-it', displayName: 'Gemma 3 12B', rateLimitRpd: 14400 },
      { name: 'gemma-3-4b-it', displayName: 'Gemma 3 4B', rateLimitRpd: 14400 },
      { name: 'gemma-3-1b-it', displayName: 'Gemma 3 1B', rateLimitRpd: 14400 },
      { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', rateLimitRpd: 1500 },
      { name: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite', rateLimitRpd: 1500 },
    ],
  },
  {
    name: 'OpenRouter',
    slug: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 20,
    rateLimitRpd: 50,
    priority: 4,
    models: [
      { name: 'meta-llama/llama-3.3-70b-instruct:free', displayName: 'Llama 3.3 70B (Free)', isDefault: true },
      { name: 'google/gemma-3-27b-it:free', displayName: 'Gemma 3 27B (Free)' },
      { name: 'google/gemma-3-12b-it:free', displayName: 'Gemma 3 12B (Free)' },
      { name: 'deepseek/deepseek-r1-0528:free', displayName: 'DeepSeek R1 (Free)' },
      { name: 'qwen/qwen3-4b:free', displayName: 'Qwen 3 4B (Free)' },
      { name: 'qwen/qwen3-coder:free', displayName: 'Qwen 3 Coder (Free)' },
      { name: 'mistralai/mistral-small-3.1-24b-instruct:free', displayName: 'Mistral Small 3.1 (Free)' },
      { name: 'moonshotai/kimi-k2:free', displayName: 'Kimi K2 (Free)' },
      { name: 'openai/gpt-oss-120b:free', displayName: 'GPT-OSS 120B (Free)' },
      { name: 'openai/gpt-oss-20b:free', displayName: 'GPT-OSS 20B (Free)' },
    ],
  },
  {
    name: 'Mistral AI',
    slug: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 1,
    rateLimitRpd: 500,
    priority: 5,
    models: [
      { name: 'mistral-small-latest', displayName: 'Mistral Small', isDefault: true },
      { name: 'open-mistral-nemo', displayName: 'Mistral Nemo' },
      { name: 'codestral-latest', displayName: 'Codestral' },
    ],
  },
  {
    name: 'HuggingFace',
    slug: 'huggingface',
    baseUrl: 'https://api-inference.huggingface.co/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 10,
    rateLimitRpd: 1000,
    priority: 6,
    models: [
      { name: 'meta-llama/Llama-3.3-70B-Instruct', displayName: 'Llama 3.3 70B', isDefault: true },
      { name: 'mistralai/Mixtral-8x7B-Instruct-v0.1', displayName: 'Mixtral 8x7B' },
      { name: 'Qwen/Qwen2.5-72B-Instruct', displayName: 'Qwen 2.5 72B' },
    ],
  },
  {
    name: 'Together AI',
    slug: 'together',
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 60,
    rateLimitRpd: 10000,
    priority: 7,
    models: [
      { name: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B Turbo', isDefault: true },
      { name: 'Qwen/Qwen2.5-Coder-32B-Instruct', displayName: 'Qwen 2.5 Coder 32B' },
      { name: 'deepseek-ai/DeepSeek-R1', displayName: 'DeepSeek R1' },
    ],
  },
  {
    name: 'Fireworks AI',
    slug: 'fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 20,
    rateLimitRpd: 5000,
    priority: 8,
    models: [
      { name: 'accounts/fireworks/models/llama-v3p3-70b-instruct', displayName: 'Llama 3.3 70B', isDefault: true },
      { name: 'accounts/fireworks/models/qwen3-235b-a22b', displayName: 'Qwen 3 235B' },
    ],
  },
  // ============================================
  // PAID PROVIDERS (Priority 9-11)
  // ============================================
  {
    name: 'DeepSeek',
    slug: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 60,
    rateLimitRpd: 10000,
    priority: 9,
    models: [
      { name: 'deepseek-chat', displayName: 'DeepSeek Chat', costPer1kInput: 0.0001, costPer1kOutput: 0.0002, isDefault: true },
      { name: 'deepseek-coder', displayName: 'DeepSeek Coder', costPer1kInput: 0.0001, costPer1kOutput: 0.0002 },
      { name: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner', costPer1kInput: 0.0005, costPer1kOutput: 0.002 },
    ],
  },
  {
    name: 'Anthropic',
    slug: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    apiFormat: 'anthropic',
    authHeader: 'x-api-key',
    authPrefix: '',
    rateLimitRpm: 50,
    rateLimitRpd: 10000,
    priority: 10,
    models: [
      { name: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', costPer1kInput: 0.003, costPer1kOutput: 0.015, maxTokens: 8192, contextWindow: 200000, isDefault: true },
      { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', costPer1kInput: 0.003, costPer1kOutput: 0.015, maxTokens: 8192, contextWindow: 200000 },
      { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', costPer1kInput: 0.0008, costPer1kOutput: 0.004, maxTokens: 8192, contextWindow: 200000 },
      { name: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', costPer1kInput: 0.015, costPer1kOutput: 0.075, maxTokens: 8192, contextWindow: 200000 },
    ],
  },
  {
    name: 'OpenAI',
    slug: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    rateLimitRpm: 60,
    rateLimitRpd: 10000,
    priority: 11,
    models: [
      { name: 'gpt-4o', displayName: 'GPT-4o', costPer1kInput: 0.0025, costPer1kOutput: 0.01, maxTokens: 16384, contextWindow: 128000, isDefault: true },
      { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini', costPer1kInput: 0.00015, costPer1kOutput: 0.0006, maxTokens: 16384, contextWindow: 128000 },
      { name: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', costPer1kInput: 0.01, costPer1kOutput: 0.03, maxTokens: 4096, contextWindow: 128000 },
      { name: 'o1', displayName: 'O1', costPer1kInput: 0.015, costPer1kOutput: 0.06, maxTokens: 100000, contextWindow: 200000 },
      { name: 'o3-mini', displayName: 'O3 Mini', costPer1kInput: 0.00115, costPer1kOutput: 0.0044, maxTokens: 100000, contextWindow: 200000 },
    ],
  },
];
