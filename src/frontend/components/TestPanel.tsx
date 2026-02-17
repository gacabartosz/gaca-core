import React, { useState, useEffect, useRef } from 'react';
import { api, CompletionResponse, Prompt } from '../api';

export default function TestPanel() {
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptName, setSystemPromptName] = useState('');
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [temperature, setTemperature] = useState('0.3');
  const [maxTokens, setMaxTokens] = useState('500');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [response, setResponse] = useState<CompletionResponse | null>(null);
  const [streamContent, setStreamContent] = useState('');
  const [streamMeta, setStreamMeta] = useState<Omit<CompletionResponse, 'content'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPrompts();
  }, []);

  // Auto-scroll the content area during streaming
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamContent]);

  const loadPrompts = async () => {
    try {
      const data = await api.getPrompts();
      setPrompts(data);
    } catch (e) {
      console.error('Failed to load prompts:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setStreamContent('');
    setStreamMeta(null);

    if (streaming) {
      await handleStreamRequest();
    } else {
      await handleNormalRequest();
    }
  };

  const handleNormalRequest = async () => {
    try {
      const result = await api.complete({
        prompt,
        systemPrompt: systemPrompt || undefined,
        systemPromptName: systemPromptName || undefined,
        temperature: parseFloat(temperature),
        maxTokens: parseInt(maxTokens),
      });
      setResponse(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStreamRequest = async () => {
    try {
      const res = await fetch('/api/complete/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt: systemPrompt || undefined,
          systemPromptName: systemPromptName || undefined,
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream available');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (data.error) {
              setError(data.error);
              break;
            }

            if (data.done) {
              // Final event with metadata
              setStreamMeta({
                model: data.model,
                modelId: data.modelId,
                providerId: data.providerId,
                providerName: data.providerName,
                tokensUsed: data.tokensUsed,
                latencyMs: data.latencyMs,
              });
            } else {
              // Token event
              fullContent += data.token;
              setStreamContent(fullContent);
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      // If we got content but no metadata (edge case), still show content
      if (fullContent && !error) {
        setStreamContent(fullContent);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const hasStreamResult = streamContent || streamMeta;
  const displayContent = streaming ? streamContent : response?.content;
  const displayMeta = streaming ? streamMeta : response
    ? { model: response.model, modelId: response.modelId, providerId: response.providerId, providerName: response.providerName, tokensUsed: response.tokensUsed, latencyMs: response.latencyMs, cost: response.cost }
    : null;

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Input */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Test AI Completion</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">System Prompt (select or enter)</label>
            <div className="flex gap-2 mb-2">
              <select
                className="input flex-1"
                value={systemPromptName}
                onChange={(e) => {
                  setSystemPromptName(e.target.value);
                  if (e.target.value) {
                    setSystemPrompt('');
                  }
                }}
              >
                <option value="">Custom (below)</option>
                {prompts.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isCustom ? '' : '(default)'}
                  </option>
                ))}
              </select>
            </div>
            {!systemPromptName && (
              <textarea
                className="input"
                rows={3}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Optional: Enter a custom system prompt..."
              />
            )}
          </div>

          <div>
            <label className="label">Prompt</label>
            <textarea
              className="input"
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                className="input"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Max Tokens</label>
              <input
                type="number"
                min="1"
                max="4096"
                className="input"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
            </div>
          </div>

          {/* Stream toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={streaming}
              onChange={(e) => setStreaming(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-gray-300">Stream response (SSE)</span>
          </label>

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? (streaming ? 'Streaming...' : 'Processing...') : 'Send Request'}
          </button>
        </form>
      </div>

      {/* Output */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Response</h2>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {(response || hasStreamResult) && (
          <div className="space-y-4">
            {/* Metadata */}
            {displayMeta && (
              <div className="card">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">Provider:</span>{' '}
                    <span className="font-medium">{displayMeta.providerName}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Model:</span>{' '}
                    <span className="font-medium">{displayMeta.model}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Latency:</span>{' '}
                    <span className="font-medium">{displayMeta.latencyMs}ms</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Tokens:</span>{' '}
                    <span className="font-medium">{displayMeta.tokensUsed || 'N/A'}</span>
                  </div>
                  {'cost' in displayMeta && displayMeta.cost !== undefined && (
                    <div>
                      <span className="text-gray-400">Cost:</span>{' '}
                      <span className="font-medium">${(displayMeta.cost as number).toFixed(6)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Content */}
            <div className="card">
              <label className="label mb-2">
                Response Content
                {loading && streaming && (
                  <span className="ml-2 text-blue-400 text-xs animate-pulse">streaming...</span>
                )}
              </label>
              <div
                ref={contentRef}
                className="bg-gray-900 rounded-lg p-4 whitespace-pre-wrap font-mono text-sm max-h-96 overflow-y-auto"
              >
                {displayContent}
                {loading && streaming && (
                  <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5" />
                )}
              </div>
            </div>
          </div>
        )}

        {!error && !response && !hasStreamResult && (
          <div className="card text-center py-16 text-gray-500">
            Send a request to see the response
          </div>
        )}
      </div>
    </div>
  );
}
