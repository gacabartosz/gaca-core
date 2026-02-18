import React, { useState, useEffect } from 'react';
import { api, Provider, TestResult } from '../api';
import ProviderForm from './ProviderForm';
import ModelList from './ModelList';
import { ProviderListSkeleton } from './Skeleton';
import { useToast } from './Toast';

export default function ProviderList() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const data = await api.getProviders();
      setProviders(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (providerId: string) => {
    setTesting(providerId);
    try {
      const result = await api.testProvider(providerId);
      setTestResults((prev) => ({ ...prev, [providerId]: result }));
      if (result.success) {
        addToast(`Provider test passed (${result.latencyMs}ms)`, 'success');
      } else {
        addToast(`Provider test failed: ${result.error}`, 'error');
      }
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { success: false, error: e.message },
      }));
      addToast(`Test error: ${e.message}`, 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    const enabledProviders = providers.filter((p) => p.isEnabled && p.apiKey);
    let passed = 0;
    let failed = 0;

    for (const provider of enabledProviders) {
      setTesting(provider.id);
      try {
        const result = await api.testProvider(provider.id);
        setTestResults((prev) => ({ ...prev, [provider.id]: result }));
        if (result.success) passed++;
        else failed++;
      } catch (e: any) {
        setTestResults((prev) => ({
          ...prev,
          [provider.id]: { success: false, error: e.message },
        }));
        failed++;
      }
      setTesting(null);
    }

    addToast(`Test complete: ${passed} passed, ${failed} failed`, passed > 0 && failed === 0 ? 'success' : 'error');
    setTestingAll(false);
  };

  const handleToggle = async (provider: Provider) => {
    try {
      await api.updateProvider(provider.id, { isEnabled: !provider.isEnabled });
      loadProviders();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    try {
      await api.deleteProvider(providerId);
      loadProviders();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSave = async (data: Partial<Provider>) => {
    if (editingProvider) {
      await api.updateProvider(editingProvider.id, data);
    } else {
      await api.createProvider(data);
    }
    setShowForm(false);
    setEditingProvider(null);
    loadProviders();
  };

  const getStatusDot = (provider: Provider) => {
    if (!provider.isEnabled) return 'bg-gray-500';
    const result = testResults[provider.id];
    if (!result) return 'bg-yellow-500'; // untested
    return result.success ? 'bg-green-500' : 'bg-red-500';
  };

  // Find max latency for scaling bars
  const testedLatencies = Object.values(testResults)
    .filter((r) => r.success && r.latencyMs)
    .map((r) => r.latencyMs!);
  const maxLatency = Math.max(...testedLatencies, 1);

  if (loading) {
    return <ProviderListSkeleton />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">AI Providers</h2>
        <div className="flex items-center gap-2">
          <button onClick={handleTestAll} disabled={testingAll} className="btn btn-secondary btn-sm">
            {testingAll ? 'Testing All...' : 'Test All Providers'}
          </button>
          <button
            onClick={() => {
              setEditingProvider(null);
              setShowForm(true);
            }}
            className="btn btn-primary btn-sm"
          >
            + Add Provider
          </button>
        </div>
      </div>

      {error && <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-red-300">{error}</div>}

      {/* Latency comparison */}
      {testedLatencies.length > 1 && (
        <div className="card mb-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Latency Comparison</h3>
          <div className="space-y-2">
            {providers
              .filter((p) => testResults[p.id]?.success && testResults[p.id]?.latencyMs)
              .sort((a, b) => (testResults[a.id].latencyMs || 0) - (testResults[b.id].latencyMs || 0))
              .map((provider) => {
                const latency = testResults[provider.id].latencyMs!;
                const width = Math.max((latency / maxLatency) * 100, 5);
                return (
                  <div key={provider.id} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-24 truncate">{provider.name}</span>
                    <div className="flex-1 h-4 bg-gray-700 rounded overflow-hidden">
                      <div
                        className={`h-full rounded ${latency < 1000 ? 'bg-green-600' : latency < 3000 ? 'bg-yellow-600' : 'bg-red-600'}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-gray-300 w-16 text-right">{latency}ms</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {providers.map((provider) => (
          <div key={provider.id} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Status dot */}
                <div className={`w-3 h-3 rounded-full shrink-0 ${getStatusDot(provider)}`} />
                <button
                  onClick={() => handleToggle(provider)}
                  className={`w-10 h-6 rounded-full transition-colors ${
                    provider.isEnabled ? 'bg-green-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform transform ${
                      provider.isEnabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
                <div>
                  <h3 className="font-medium">{provider.name}</h3>
                  <p className="text-sm text-gray-400">
                    {provider.apiKey ? '✓ API Key configured' : '⚠ No API key'} • {provider.models.length} models •
                    Priority: {provider.priority}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {testResults[provider.id] && (
                  <span className={`badge ${testResults[provider.id].success ? 'badge-success' : 'badge-danger'}`}>
                    {testResults[provider.id].success
                      ? `OK ${testResults[provider.id].latencyMs}ms`
                      : testResults[provider.id].error?.substring(0, 30)}
                  </span>
                )}
                <button
                  onClick={() => handleTest(provider.id)}
                  disabled={testing === provider.id || testingAll}
                  className="btn btn-secondary btn-sm"
                >
                  {testing === provider.id ? 'Testing...' : 'Test'}
                </button>
                <button
                  onClick={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
                  className="btn btn-secondary btn-sm"
                >
                  {expandedProvider === provider.id ? 'Hide' : 'Models'}
                </button>
                <button
                  onClick={() => {
                    setEditingProvider(provider);
                    setShowForm(true);
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Edit
                </button>
                <button onClick={() => handleDelete(provider.id)} className="btn btn-danger btn-sm">
                  Delete
                </button>
              </div>
            </div>

            {/* Usage bar */}
            {provider.rateLimitRpd && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Daily usage</span>
                  <span>
                    {provider.usage?.requestsToday || 0} / {provider.rateLimitRpd}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill bg-blue-500"
                    style={{
                      width: `${Math.min(((provider.usage?.requestsToday || 0) / provider.rateLimitRpd) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Expanded models list */}
            {expandedProvider === provider.id && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <ModelList providerId={provider.id} models={provider.models} onRefresh={loadProviders} />
              </div>
            )}
          </div>
        ))}

        {providers.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            No providers configured. Click "Add Provider" to get started.
          </div>
        )}
      </div>

      {/* Provider form modal */}
      {showForm && (
        <ProviderForm
          provider={editingProvider}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingProvider(null);
          }}
        />
      )}
    </div>
  );
}
