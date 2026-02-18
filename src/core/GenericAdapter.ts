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
    const label = `${this.provider.name}/${model.displayName || model.name}`;

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
        throw new Error(`${label}: HTTP ${response.status} - ${errorText.substring(0, 300)}`);
      }

      const data = await response.json();
      return this.parseResponse(model, data, latencyMs);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`${label}: request timeout after 30s`);
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

  private buildRequest(
    model: ModelConfig,
    request: AIRequest,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
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

  private buildOpenAIRequest(
    model: ModelConfig,
    request: AIRequest,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
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

  private buildGoogleRequest(
    model: ModelConfig,
    request: AIRequest,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
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

  private buildAnthropicRequest(
    model: ModelConfig,
    request: AIRequest,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
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

  private buildCustomRequest(
    model: ModelConfig,
    request: AIRequest,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
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
      throw new Error(
        `${this.provider.name}/${model.name}: invalid response format (missing choices[0].message.content)`,
      );
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
        throw new Error(`${this.provider.name}/${model.name}: content blocked by safety filters`);
      }
      throw new Error(
        `${this.provider.name}/${model.name}: invalid response format (missing candidates[0].content.parts[0].text)`,
      );
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
      throw new Error(`${this.provider.name}/${model.name}: invalid response format (missing content[0].text)`);
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
      throw new Error(`${this.provider.name}/${model.name}: could not parse response`);
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

  // Streaming completion — calls onToken for each token, returns final AIResponse
  async completeStream(model: ModelConfig, request: AIRequest, onToken: (token: string) => void): Promise<AIResponse> {
    const startTime = Date.now();
    const label = `${this.provider.name}/${model.displayName || model.name}`;
    const format = this.provider.apiFormat as ApiFormat;

    try {
      const { url, headers, body } = this.buildStreamRequest(model, request);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // longer timeout for streaming

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${label}: HTTP ${response.status} - ${errorText.substring(0, 300)}`);
      }

      if (!response.body) {
        throw new Error(`${label}: no response body for streaming`);
      }

      switch (format) {
        case 'google':
          return await this.parseGoogleStream(model, response, startTime, onToken);
        case 'anthropic':
          return await this.parseAnthropicStream(model, response, startTime, onToken);
        default:
          return await this.parseOpenAIStream(model, response, startTime, onToken);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`${label}: stream timeout after 60s`);
      }
      throw error;
    }
  }

  private buildStreamRequest(
    model: ModelConfig,
    request: AIRequest,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    const format = this.provider.apiFormat as ApiFormat;

    switch (format) {
      case 'google':
        return this.buildGoogleStreamRequest(model, request);
      case 'anthropic': {
        const req = this.buildAnthropicRequest(model, request);
        req.body.stream = true;
        return req;
      }
      default: {
        // OpenAI-compatible (Groq, Cerebras, OpenRouter, Mistral, Together, Fireworks, DeepSeek, OpenAI)
        const req = this.buildOpenAIRequest(model, request);
        req.body.stream = true;
        return req;
      }
    }
  }

  private buildGoogleStreamRequest(
    model: ModelConfig,
    request: AIRequest,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    let fullPrompt = request.prompt;
    if (request.systemPrompt) {
      fullPrompt = `${request.systemPrompt}\n\n${request.prompt}`;
    }

    const url = `${this.provider.baseUrl}/${model.name}:streamGenerateContent?key=${this.provider.apiKey}&alt=sse`;

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

  private async parseOpenAIStream(
    model: ModelConfig,
    response: Response,
    startTime: number,
    onToken: (token: string) => void,
  ): Promise<AIResponse> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let finishReason: string | undefined;
    let modelName = model.name;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              onToken(delta);
            }
            if (parsed.choices?.[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason;
            }
            if (parsed.model) {
              modelName = parsed.model;
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const latencyMs = Date.now() - startTime;
    return {
      content,
      model: modelName,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      latencyMs,
      finishReason,
    };
  }

  private async parseGoogleStream(
    model: ModelConfig,
    response: Response,
    startTime: number,
    onToken: (token: string) => void,
  ): Promise<AIResponse> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let finishReason: string | undefined;
    let tokensUsed: number | undefined;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              content += text;
              onToken(text);
            }
            if (parsed.candidates?.[0]?.finishReason) {
              finishReason = parsed.candidates[0].finishReason;
            }
            if (parsed.usageMetadata) {
              tokensUsed = parsed.usageMetadata.totalTokenCount;
              inputTokens = parsed.usageMetadata.promptTokenCount;
              outputTokens = parsed.usageMetadata.candidatesTokenCount;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const latencyMs = Date.now() - startTime;
    return {
      content,
      model: model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      tokensUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason,
      cost: this.calculateCost(model, inputTokens, outputTokens),
    };
  }

  private async parseAnthropicStream(
    model: ModelConfig,
    response: Response,
    startTime: number,
    onToken: (token: string) => void,
  ): Promise<AIResponse> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let finishReason: string | undefined;
    let modelName = model.name;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              content += parsed.delta.text;
              onToken(parsed.delta.text);
            }
            if (parsed.type === 'message_start' && parsed.message) {
              modelName = parsed.message.model || modelName;
              inputTokens = parsed.message.usage?.input_tokens;
            }
            if (parsed.type === 'message_delta') {
              finishReason = parsed.delta?.stop_reason;
              outputTokens = parsed.usage?.output_tokens;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const latencyMs = Date.now() - startTime;
    const tokensUsed = (inputTokens || 0) + (outputTokens || 0);

    return {
      content,
      model: modelName,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      tokensUsed: tokensUsed || undefined,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason,
      cost: this.calculateCost(model, inputTokens, outputTokens),
    };
  }

  getProvider(): ProviderConfig {
    return this.provider;
  }
}
