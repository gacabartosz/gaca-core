import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { UsageStatsSkeleton } from './Skeleton';

interface UsageSummary {
  totalRequestsToday: number;
  totalTokensToday: number;
  estimatedCost: number;
  failoverEventsToday: number;
  providers: Array<{
    id: string;
    name: string;
    requestsToday: number;
    dailyLimit: number | null;
    usagePercent: number;
    totalTokensUsed: number;
    isEnabled: boolean;
  }>;
}

interface FailoverEvent {
  id: string;
  fromModelId: string | null;
  toModelId: string | null;
  reason: string;
  errorMessage: string | null;
  latencyMs: number | null;
  createdAt: string;
}

export default function UsageStats() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [failovers, setFailovers] = useState<FailoverEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usageData, failoverData] = await Promise.all([
        api.getUsageSummary(),
        api.getFailovers(20),
      ]);
      setUsage(usageData);
      setFailovers(failoverData);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'rate_limit':
        return <span className="badge badge-warning">Rate Limit</span>;
      case 'timeout':
        return <span className="badge badge-danger">Timeout</span>;
      case 'quota_exceeded':
        return <span className="badge badge-danger">Quota</span>;
      case 'model_not_found':
        return <span className="badge badge-info">Not Found</span>;
      default:
        return <span className="badge badge-danger">Error</span>;
    }
  };

  if (loading) {
    return <UsageStatsSkeleton />;
  }

  return (
    <div>
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-red-300">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="text-sm text-gray-400">Requests Today</div>
          <div className="text-2xl font-bold">{usage?.totalRequestsToday || 0}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-400">Tokens Used</div>
          <div className="text-2xl font-bold">{usage?.totalTokensToday?.toLocaleString() || 0}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-400">Estimated Cost</div>
          <div className="text-2xl font-bold">${usage?.estimatedCost?.toFixed(4) || '0.0000'}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-400">Failovers Today</div>
          <div className="text-2xl font-bold text-yellow-400">{usage?.failoverEventsToday || 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Provider usage */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Provider Usage</h2>
          <div className="space-y-3">
            {usage?.providers.map((provider) => (
              <div key={provider.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{provider.name}</span>
                  <span className={`badge ${provider.isEnabled ? 'badge-success' : 'badge-warning'}`}>
                    {provider.isEnabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {provider.dailyLimit ? (
                  <>
                    <div className="flex justify-between text-sm text-gray-400 mb-1">
                      <span>
                        {provider.requestsToday} / {provider.dailyLimit} requests
                      </span>
                      <span>{provider.usagePercent}%</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-bar-fill ${getUsageColor(provider.usagePercent)}`}
                        style={{ width: `${Math.min(provider.usagePercent, 100)}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400">
                    {provider.requestsToday} requests (no limit)
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent failovers */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Recent Failovers</h2>
          <div className="card overflow-hidden">
            {failovers.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Reason</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {failovers.map((event) => (
                    <tr key={event.id}>
                      <td className="text-sm text-gray-400">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </td>
                      <td>{getReasonBadge(event.reason)}</td>
                      <td className="text-sm text-gray-400 truncate max-w-[200px]">
                        {event.errorMessage?.substring(0, 50) || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-gray-500">No failover events</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button onClick={loadData} className="btn btn-secondary btn-sm">
          Refresh
        </button>
      </div>
    </div>
  );
}
