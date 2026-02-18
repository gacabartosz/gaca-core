// GenericAdapter - Universal adapter for all AI providers
// Supports: OpenAI, Anthropic, Google, Custom API formats

import {
  ProviderConfig,
  ModelConfig,
  AIRequest,
  AIResponse,
  ApiFormat,
  TestResult,
  CompletionMessage,
  TokenUsage,
  generateRequestId,
} from './types.js';

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
    // Handle both prompt (simple) and messages (OpenAI-style) formats
    let messages: Array<{ role: string; content: string | unknown[] }>;

    if (request.messages && request.messages.length > 0) {
      // Use provided messages directly (OpenAI-style)
      messages = request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } else {
      // Convert prompt to messages format
      messages = [];
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: request.prompt || '' });
    }

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

    const body: Record<string, unknown> = {
      model: model.name,
      messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? model.maxTokens ?? 500,
    };

    // Add optional parameters if provided
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.frequencyPenalty !== undefined) body.frequency_penalty = request.frequencyPenalty;
    if (request.presencePenalty !== undefined) body.presence_penalty = request.presencePenalty;
    if (request.stop !== undefined) body.stop = request.stop;
    if (request.responseFormat !== undefined) body.response_format = request.responseFormat;

    return {
      url: this.provider.baseUrl,
      headers,
      body,
    };
  }

  private buildGoogleRequest(
    model: ModelConfig,
    request: AIRequest,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    // Handle both prompt and messages format
    let fullPrompt: string;

    if (request.messages && request.messages.length > 0) {
      // Convert messages to single prompt (Google uses different format)
      const parts: string[] = [];
      for (const msg of request.messages) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (msg.role === 'system') {
          parts.unshift(`[System]: ${content}`);
        } else if (msg.role === 'user') {
          parts.push(`User: ${content}`);
        } else if (msg.role === 'assistant') {
          parts.push(`Assistant: ${content}`);
        }
      }
      fullPrompt = parts.join('\n\n');
    } else {
      fullPrompt = request.prompt || '';
      if (request.systemPrompt) {
        fullPrompt = `${request.systemPrompt}\n\n${fullPrompt}`;
      }
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

    // Handle both prompt and messages format
    let systemPrompt: string | undefined;
    let messages: Array<{ role: string; content: string | unknown[] }>;

    if (request.messages && request.messages.length > 0) {
      // Extract system message and convert rest to Anthropic format
      const systemMsg = request.messages.find((m) => m.role === 'system');
      systemPrompt = systemMsg
        ? typeof systemMsg.content === 'string'
          ? systemMsg.content
          : JSON.stringify(systemMsg.content)
        : undefined;

      messages = request.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));
    } else {
      systemPrompt = request.systemPrompt;
      messages = [{ role: 'user', content: request.prompt || '' }];
    }

    const body: Record<string, unknown> = {
      model: model.name,
      max_tokens: request.maxTokens ?? model.maxTokens ?? 500,
      messages,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.topP !== undefined) {
      body.top_p = request.topP;
    }

    return {
      url: this.provider.baseUrl,
      headers,
      body,
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

    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const tokensUsed = data.usage?.total_tokens || inputTokens + outputTokens;
    const cost = this.calculateCost(model, inputTokens, outputTokens) || 0;

    return {
      id: data.id || generateRequestId(),
      content: data.choices[0].message.content,
      model: data.model || model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: tokensUsed,
      },
      tokensUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason: this.normalizeFinishReason(data.choices[0].finish_reason),
      cost,
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

    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const tokensUsed = data.usageMetadata?.totalTokenCount || inputTokens + outputTokens;
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    return {
      id: generateRequestId(),
      content: data.candidates[0].content.parts[0].text,
      model: model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: tokensUsed,
      },
      tokensUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason: this.normalizeFinishReason(data.candidates[0].finishReason),
      cost,
    };
  }

  private parseAnthropicResponse(model: ModelConfig, data: any, latencyMs: number): AIResponse {
    if (!data.content || !data.content[0]?.text) {
      throw new Error(`${this.provider.name}/${model.name}: invalid response format (missing content[0].text)`);
    }

    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const tokensUsed = inputTokens + outputTokens;
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    return {
      id: data.id || generateRequestId(),
      content: data.content[0].text,
      model: data.model || model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: tokensUsed,
      },
      tokensUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason: this.normalizeFinishReason(data.stop_reason),
      cost,
    };
  }

  private parseCustomResponse(model: ModelConfig, data: any, latencyMs: number): AIResponse {
    // Try common response formats
    const content = data.content || data.text || data.response || data.output || data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`${this.provider.name}/${model.name}: could not parse response`);
    }

    const inputTokens = data.usage?.prompt_tokens || data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || data.usage?.output_tokens || 0;
    const tokensUsed = data.tokens || data.usage?.total_tokens || inputTokens + outputTokens;
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    return {
      id: data.id || generateRequestId(),
      content,
      model: data.model || model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: tokensUsed,
      },
      tokensUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      finishReason: this.normalizeFinishReason(data.finish_reason || data.stop_reason),
      cost,
    };
  }

  private calculateCost(model: ModelConfig, inputTokens?: number, outputTokens?: number): number {
    if (!inputTokens && !outputTokens) return 0;
    if (!model.costPer1kInput && !model.costPer1kOutput) return 0;

    const inputCost = (inputTokens || 0) * (model.costPer1kInput / 1000);
    const outputCost = (outputTokens || 0) * (model.costPer1kOutput / 1000);

    return inputCost + outputCost;
  }

  private normalizeFinishReason(reason?: string): 'stop' | 'length' | 'content_filter' | 'error' {
    if (!reason) return 'stop';
    const r = reason.toLowerCase();
    if (r === 'stop' || r === 'end_turn' || r === 'eos' || r === 'stop_sequence') return 'stop';
    if (r === 'length' || r === 'max_tokens') return 'length';
    if (r === 'content_filter' || r === 'safety' || r === 'blocked') return 'content_filter';
    return 'error';
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
    // Handle both prompt and messages format
    let fullPrompt: string;

    if (request.messages && request.messages.length > 0) {
      // Convert messages to single prompt (Google uses different format)
      const parts: string[] = [];
      for (const msg of request.messages) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (msg.role === 'system') {
          parts.unshift(`[System]: ${content}`);
        } else if (msg.role === 'user') {
          parts.push(`User: ${content}`);
        } else if (msg.role === 'assistant') {
          parts.push(`Assistant: ${content}`);
        }
      }
      fullPrompt = parts.join('\n\n');
    } else {
      fullPrompt = request.prompt || '';
      if (request.systemPrompt) {
        fullPrompt = `${request.systemPrompt}\n\n${fullPrompt}`;
      }
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
    let responseId: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
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
            if (parsed.id) {
              responseId = parsed.id;
            }
            // Some providers send usage in the final chunk
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
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
    const tokensUsed = inputTokens + outputTokens;
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    return {
      id: responseId || generateRequestId(),
      content,
      model: modelName,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: tokensUsed,
      },
      tokensUsed: tokensUsed || undefined,
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      latencyMs,
      finishReason: this.normalizeFinishReason(finishReason),
      cost,
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
    let inputTokens = 0;
    let outputTokens = 0;
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
              inputTokens = parsed.usageMetadata.promptTokenCount || 0;
              outputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
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
    const tokensUsed = inputTokens + outputTokens;
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    return {
      id: generateRequestId(),
      content,
      model: model.name,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: tokensUsed,
      },
      tokensUsed: tokensUsed || undefined,
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      latencyMs,
      finishReason: this.normalizeFinishReason(finishReason),
      cost,
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
    let responseId: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
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
              responseId = parsed.message.id;
              inputTokens = parsed.message.usage?.input_tokens || 0;
            }
            if (parsed.type === 'message_delta') {
              finishReason = parsed.delta?.stop_reason;
              outputTokens = parsed.usage?.output_tokens || 0;
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
    const tokensUsed = inputTokens + outputTokens;
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    return {
      id: responseId || generateRequestId(),
      content,
      model: modelName,
      modelId: model.id,
      providerId: this.provider.id,
      providerName: this.provider.name,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: tokensUsed,
      },
      tokensUsed: tokensUsed || undefined,
      inputTokens: inputTokens || undefined,
      outputTokens: outputTokens || undefined,
      latencyMs,
      finishReason: this.normalizeFinishReason(finishReason),
      cost,
    };
  }

  getProvider(): ProviderConfig {
    return this.provider;
  }
}
