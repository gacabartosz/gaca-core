// API client for GACA-Core

const API_BASE = '/api';

export interface Provider {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  apiKey: string | null;
  apiFormat: string;
  authHeader: string;
  authPrefix: string;
  customHeaders: Record<string, string>;
  rateLimitRpm: number | null;
  rateLimitRpd: number | null;
  isEnabled: boolean;
  priority: number;
  models: Model[];
  usage: {
    requestsToday: number;
    requestsThisMinute: number;
    totalTokensUsed: number;
    totalCostUsd: number;
  } | null;
}

export interface Model {
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
  usage: {
    requestsToday: number;
    requestsThisMinute: number;
    totalCalls: number;
    successCount: number;
    failureCount: number;
    totalTokensUsed: number;
  } | null;
  ranking: {
    score: number;
    successRate: number;
    avgLatencyMs: number;
    sampleSize: number;
  } | null;
}

export interface Ranking {
  modelId: string;
  modelName: string;
  providerName: string;
  score: number;
  successRate: number;
  avgLatencyMs: number;
  sampleSize: number;
}

export interface Prompt {
  name: string;
  isCustom: boolean;
}

export interface TestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
  model?: string;
}

export interface CompletionResponse {
  content: string;
  model: string;
  modelId: string;
  providerId: string;
  providerName: string;
  tokensUsed?: number;
  latencyMs: number;
  cost?: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}

// Providers
export const api = {
  // Providers
  getProviders: () => request<Provider[]>('/providers'),
  getProvider: (id: string) => request<Provider>(`/providers/${id}`),
  createProvider: (data: Partial<Provider>) =>
    request<Provider>('/providers', { method: 'POST', body: JSON.stringify(data) }),
  updateProvider: (id: string, data: Partial<Provider>) =>
    request<Provider>(`/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProvider: (id: string) =>
    request<void>(`/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: string) =>
    request<TestResult>(`/providers/${id}/test`, { method: 'POST' }),
  getUsageSummary: () => request<any>('/providers/stats/usage'),

  // Models
  getModels: (providerId?: string) =>
    request<Model[]>(`/models${providerId ? `?providerId=${providerId}` : ''}`),
  getModel: (id: string) => request<Model>(`/models/${id}`),
  createModel: (data: Partial<Model>) =>
    request<Model>('/models', { method: 'POST', body: JSON.stringify(data) }),
  updateModel: (id: string, data: Partial<Model>) =>
    request<Model>(`/models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteModel: (id: string) =>
    request<void>(`/models/${id}`, { method: 'DELETE' }),

  // Ranking
  getRankings: () => request<Ranking[]>('/ranking'),
  getRanking: (modelId: string) => request<Ranking>(`/ranking/${modelId}`),
  recalculateRankings: () =>
    request<{ message: string; rankings: Ranking[] }>('/ranking/recalculate', { method: 'POST' }),

  // Prompts
  getPrompts: () => request<Prompt[]>('/prompts'),
  getPrompt: (name: string) => request<{ name: string; content: string }>(`/prompts/${name}`),
  savePrompt: (name: string, content: string) =>
    request<Prompt>('/prompts', { method: 'POST', body: JSON.stringify({ name, content }) }),
  deletePrompt: (name: string) =>
    request<void>(`/prompts/${name}`, { method: 'DELETE' }),

  // Completion
  complete: (data: {
    prompt: string;
    systemPrompt?: string;
    systemPromptName?: string;
    temperature?: number;
    maxTokens?: number;
    providerId?: string;
    modelId?: string;
  }) => request<CompletionResponse>('/complete', { method: 'POST', body: JSON.stringify(data) }),
  getAvailableModels: () => request<any[]>('/complete/available'),
  getFailovers: (limit?: number) =>
    request<any[]>(`/complete/failovers${limit ? `?limit=${limit}` : ''}`),
};
