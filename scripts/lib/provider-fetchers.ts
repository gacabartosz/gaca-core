// Shared provider fetcher library
// Extracted from discover-models.ts for reuse in auto-discover.ts

import { DefaultProviderConfig } from '../../src/core/types.js';

// Slug-to-env mapping (special cases)
const slugToEnv: Record<string, string> = {
  google: 'GOOGLE_AI_API_KEY',
};

export function getApiKey(slug: string): string | null {
  const envKey = slugToEnv[slug] || `${slug.toUpperCase().replace(/-/g, '_')}_API_KEY`;
  return process.env[envKey] || null;
}

// Provider-specific model fetchers
export interface RemoteModel {
  id: string;
  name?: string;
  owned_by?: string;
}

export type FetcherFn = (apiKey: string | null) => Promise<RemoteModel[]>;

export const PROVIDER_FETCHERS: Record<string, FetcherFn> = {
  groq: async (apiKey) => {
    const res = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json();
    return (json.data || []) as RemoteModel[];
  },

  cerebras: async (apiKey) => {
    const res = await fetchWithTimeout('https://api.cerebras.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json();
    return (json.data || []) as RemoteModel[];
  },

  google: async (apiKey) => {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const json = await res.json();
    return ((json.models || []) as Array<{ name: string }>).map((m) => ({
      id: m.name.replace(/^models\//, ''),
    }));
  },

  openrouter: async () => {
    // Public endpoint, no auth needed
    const res = await fetchWithTimeout('https://openrouter.ai/api/v1/models');
    const json = await res.json();
    // Filter to free models only
    return ((json.data || []) as Array<{ id: string; pricing?: { prompt?: string } }>)
      .filter((m) => m.pricing?.prompt === '0')
      .map((m) => ({ id: m.id }));
  },

  mistral: async (apiKey) => {
    const res = await fetchWithTimeout('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json();
    return (json.data || []) as RemoteModel[];
  },

  huggingface: async (apiKey) => {
    const res = await fetchWithTimeout(
      'https://api-inference.huggingface.co/framework/text-generation-inference',
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    const json = await res.json();
    return (Array.isArray(json) ? json : []).map((m: any) => ({
      id: typeof m === 'string' ? m : m.id || m.model_id || '',
    }));
  },

  together: async (apiKey) => {
    const res = await fetchWithTimeout('https://api.together.xyz/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json();
    return (Array.isArray(json) ? json : json.data || []).map((m: any) => ({
      id: m.id || m.name || '',
    }));
  },

  fireworks: async (apiKey) => {
    const res = await fetchWithTimeout('https://api.fireworks.ai/inference/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await res.json();
    return (json.data || []) as RemoteModel[];
  },
};

export async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export interface DiscoveryResult {
  provider: string;
  slug: string;
  newModels: string[];
  missingModels: string[];
  matchedModels: string[];
  remoteTotal: number;
  error?: string;
}

export async function discoverProvider(providerConfig: DefaultProviderConfig): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    provider: providerConfig.name,
    slug: providerConfig.slug,
    newModels: [],
    missingModels: [],
    matchedModels: [],
    remoteTotal: 0,
  };

  const fetcher = PROVIDER_FETCHERS[providerConfig.slug];
  if (!fetcher) {
    result.error = 'No fetcher defined';
    return result;
  }

  const apiKey = getApiKey(providerConfig.slug);
  // OpenRouter doesn't need auth
  if (!apiKey && providerConfig.slug !== 'openrouter') {
    result.error = 'No API key';
    return result;
  }

  try {
    const remoteModels = await fetcher(apiKey);
    result.remoteTotal = remoteModels.length;

    const remoteIds = new Set(remoteModels.map((m) => m.id));
    const localNames = new Set(providerConfig.models.map((m) => m.name));

    // NEW: remote but not local
    for (const id of remoteIds) {
      if (!localNames.has(id)) {
        result.newModels.push(id);
      }
    }

    // MISSING: local but not remote
    for (const name of localNames) {
      if (!remoteIds.has(name)) {
        result.missingModels.push(name);
      }
    }

    // MATCHED: in both
    for (const name of localNames) {
      if (remoteIds.has(name)) {
        result.matchedModels.push(name);
      }
    }
  } catch (err: any) {
    result.error = err.message;
  }

  return result;
}

export async function testModel(
  providerConfig: DefaultProviderConfig,
  modelId: string
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const apiKey = getApiKey(providerConfig.slug);
  if (!apiKey && providerConfig.slug !== 'openrouter') {
    return { success: false, latencyMs: 0, error: 'No API key' };
  }

  const start = Date.now();

  try {
    if (providerConfig.slug === 'google') {
      // Google uses its own format
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say OK' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { success: text.length > 0, latencyMs: Date.now() - start };
    }

    // OpenAI-compatible providers
    const baseUrl = providerConfig.baseUrl.replace('/chat/completions', '');
    const url = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey && providerConfig.authHeader) {
      headers[providerConfig.authHeader] = `${providerConfig.authPrefix}${apiKey}`;
    }

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 10,
      }),
    });
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content || '';
    return { success: content.length > 0, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, latencyMs: Date.now() - start, error: err.message };
  }
}

// FREE_PROVIDERS = slugs of providers that have free tier and fetchers
export const FREE_PROVIDER_SLUGS = Object.keys(PROVIDER_FETCHERS);
