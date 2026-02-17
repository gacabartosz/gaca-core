import React, { useState, useEffect } from 'react';
import { api, CompletionResponse, Prompt } from '../api';

export default function TestPanel() {
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptName, setSystemPromptName] = useState('');
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [temperature, setTemperature] = useState('0.3');
  const [maxTokens, setMaxTokens] = useState('500');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<CompletionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPrompts();
  }, []);

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

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Processing...' : 'Send Request'}
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

        {response && (
          <div className="space-y-4">
            {/* Metadata */}
            <div className="card">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Provider:</span>{' '}
                  <span className="font-medium">{response.providerName}</span>
                </div>
                <div>
                  <span className="text-gray-400">Model:</span>{' '}
                  <span className="font-medium">{response.model}</span>
                </div>
                <div>
                  <span className="text-gray-400">Latency:</span>{' '}
                  <span className="font-medium">{response.latencyMs}ms</span>
                </div>
                <div>
                  <span className="text-gray-400">Tokens:</span>{' '}
                  <span className="font-medium">{response.tokensUsed || 'N/A'}</span>
                </div>
                {response.cost !== undefined && (
                  <div>
                    <span className="text-gray-400">Cost:</span>{' '}
                    <span className="font-medium">${response.cost.toFixed(6)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="card">
              <label className="label mb-2">Response Content</label>
              <div className="bg-gray-900 rounded-lg p-4 whitespace-pre-wrap font-mono text-sm">
                {response.content}
              </div>
            </div>
          </div>
        )}

        {!error && !response && (
          <div className="card text-center py-16 text-gray-500">
            Send a request to see the response
          </div>
        )}
      </div>
    </div>
  );
}
