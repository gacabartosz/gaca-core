// GenericAdapter - Universal adapter for all AI providers
// Supports: OpenAI, Anthropic, Google, Custom API formats

import { ProviderConfig, ModelConfig, AIRequest, AIResponse, ApiFormat, TestResult } from './types.js';

export class GenericAdapter {
  private provider: ProviderConfig;

  constructor(provider: ProviderConfig) {
    this.provider = provider;
  }

  async complete(model: ModelConfig, request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const { url, headers, body } = this.buildRequest(model, request);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${this.provider.name} API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return this.parseResponse(model, data, latencyMs);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`${this.provider.name} request timeout after 30s`);
      }
      throw error;
    }
  }

  async testConnection(model?: ModelConfig): Promise<TestResult> {
    try {
      const startTime = Date.now();
      const testModel = model || this.getTestModel();

      if (!testModel) {
        return { success: false, error: 'No model available for testing' };
      }

      const { url, headers, body } = this.buildRequest(testModel, {
        prompt: 'Say OK',
        maxTokens: 5,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `${response.status}: ${errorText}`, latencyMs };
      }

      return { success: true, latencyMs, model: testModel.name };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private buildRequest(model: ModelConfig, request: AIRequest): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    const format = this.provider.apiFormat as ApiFormat;

    switch (format) {
      case 'openai':
        return this.buildOpenAIRequest(model, request);
      case 'google':
        return this.buildGoogleRequest(model, request);
      case 'anthropic':
        return this.buildAnthropicRequest(model, request);
      case 'custom':
        return this.buildCustomRequest(model, request);
      default:
        return this.buildOpenAIRequest(model, request);
    }
  }

  private buildOpenAIRequest(model: ModelConfig, request: AIRequest): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    const messages: Array<{ role: string; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.provider.customHeaders,
    };

    if (this.provider.apiKey && this.provider.authHeader) {
      headers[this.provider.authHeader] = `${this.provider.authPrefix}${this.provider.apiKey}`;
    }

    // OpenRouter specific headers
    if (this.provider.slug === 'openrouter') {
      headers['HTTP-Referer'] = 'https://gaca-core.local';
      headers['X-Title'] = 'GACA-Core';
    }

    return {
      url: this.provider.baseUrl,
      headers,
      body: {
        model: model.name,
        messages,
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxTokens ?? model.maxTokens ?? 500,
      },
    };
  }

  private buildGoogleRequest(model: ModelConfig, request: AIRequest): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    let fullPrompt = request.prompt;
    if (request.systemPrompt) {
      fullPrompt = `${request.systemPrompt}\n\n${request.prompt}`;
    }

    const url = `${this.provider.baseUrl}/${model.name}:generateContent?key=${this.provider.apiKey}`;

    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        ...this.provider.customHeaders,
      },
      body: {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: request.temperature ?? 0.3,
          maxOutputTokens: request.maxTokens ?? model.maxTokens ?? 500,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      },
    };
  }

  private buildAnthropicRequest(model: ModelConfig, request: AIRequest): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...this.provider.customHeaders,
    };

    if (this.provider.apiKey) {
      headers['x-api-key'] = this.provider.apiKey;
    }

    return {
      url: this.provider.baseUrl,
      headers,
      body: {
        model: model.name,
        max_tokens: request.maxTokens ?? model.maxTokens ?? 500,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.prompt }],
      },
    };
  }

  private buildCustomRequest(model: ModelConfig, request: AIRequest): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.provider.customHeaders,
    };

    if (this.provider.apiKey && this.provider.authHeader) {
      headers[this.provider.authHeader] = `${this.provider.authPrefix}${this.provider.apiKey}`;
    }

    return {
      url: this.provider.baseUrl,
      headers,
      body: {
        model: model.name,
        prompt: request.prompt,
        system_prompt: request.systemPrompt,
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxTokens ?? model.maxTokens ?? 500,
        ...request.customBody,
      },
    };
  }

  private parseResponse(model: ModelConfig, data: any, latencyMs: number): AIResponse {
    const format = this.provider.apiFormat as ApiFormat;

    switch (format) {
      case 'openai':
        return this.parseOpenAIResponse(model, data, latencyMs);
      case 'google':
        return this.parseGoogleResponse(model, data, latencyMs);
      case 'anthropic':
        return this.parseAnthropicResponse(model, data, latencyMs);
      case 'custom':
        return this.parseCustomResponse(model, data, latencyMs);
      default:
        return this.parseOpenAIResponse(model, data, latencyMs);
    }
  }

  private parseOpenAIResponse(model: ModelConfig, data: any, latencyMs: number): AIResponse {
    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error(`Invalid ${this.provider.name} response format`);
    }

    const inputTokens = data.usage?.prompt_tokens;
    const outputTokens = data.usage?.completion_tokens;
    const tokensUsed = data.usage?.total_tokens;

    return {
      content: data.choices[0].message.content,
      model: data.model || model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      tokensUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason: data.choices[0].finish_reason,
      cost: this.calculateCost(model, inputTokens, outputTokens),
    };
  }

  private parseGoogleResponse(model: ModelConfig, data: any, latencyMs: number): AIResponse {
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error('Content blocked by safety filters');
      }
      throw new Error(`Invalid ${this.provider.name} response format`);
    }

    const tokensUsed = data.usageMetadata?.totalTokenCount;
    const inputTokens = data.usageMetadata?.promptTokenCount;
    const outputTokens = data.usageMetadata?.candidatesTokenCount;

    return {
      content: data.candidates[0].content.parts[0].text,
      model: model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      tokensUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason: data.candidates[0].finishReason,
      cost: this.calculateCost(model, inputTokens, outputTokens),
    };
  }

  private parseAnthropicResponse(model: ModelConfig, data: any, latencyMs: number): AIResponse {
    if (!data.content || !data.content[0]?.text) {
      throw new Error(`Invalid ${this.provider.name} response format`);
    }

    const inputTokens = data.usage?.input_tokens;
    const outputTokens = data.usage?.output_tokens;
    const tokensUsed = (inputTokens || 0) + (outputTokens || 0);

    return {
      content: data.content[0].text,
      model: data.model || model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      tokensUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason: data.stop_reason,
      cost: this.calculateCost(model, inputTokens, outputTokens),
    };
  }

  private parseCustomResponse(model: ModelConfig, data: any, latencyMs: number): AIResponse {
    // Try common response formats
    const content = data.content || data.text || data.response || data.output || data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`Could not parse ${this.provider.name} response`);
    }

    return {
      content,
      model: data.model || model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      tokensUsed: data.tokens || data.usage?.total_tokens,
      latencyMs,
      finishReason: data.finish_reason || data.stop_reason,
    };
  }

  private calculateCost(model: ModelConfig, inputTokens?: number, outputTokens?: number): number | undefined {
    if (!inputTokens && !outputTokens) return undefined;
    if (!model.costPer1kInput && !model.costPer1kOutput) return undefined;

    const inputCost = (inputTokens || 0) * (model.costPer1kInput / 1000);
    const outputCost = (outputTokens || 0) * (model.costPer1kOutput / 1000);

    return inputCost + outputCost;
  }

  private getTestModel(): ModelConfig | null {
    // Return a minimal model config for testing
    return {
      id: 'test',
      providerId: this.provider.id,
      name: 'test-model',
      displayName: 'Test Model',
      rateLimitRpm: null,
      rateLimitRpd: null,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      maxTokens: 100,
      contextWindow: 4096,
      isEnabled: true,
      isDefault: true,
    };
  }

  getProvider(): ProviderConfig {
    return this.provider;
  }
}
