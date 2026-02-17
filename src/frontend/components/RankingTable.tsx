import React, { useState, useEffect } from 'react';
import { api, Ranking } from '../api';

export default function RankingTable() {
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    loadRankings();
  }, []);

  const loadRankings = async () => {
    try {
      setLoading(true);
      const data = await api.getRankings();
      setRankings(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const result = await api.recalculateRankings();
      setRankings(result.rankings);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecalculating(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-400';
    if (score >= 0.6) return 'text-yellow-400';
    if (score >= 0.4) return 'text-orange-400';
    return 'text-red-400';
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 0.95) return 'text-green-400';
    if (rate >= 0.8) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return <div className="text-center py-8">Loading rankings...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Model Rankings</h2>
          <p className="text-sm text-gray-400">
            Models sorted by effectiveness score (success rate, latency, quality)
          </p>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="btn btn-secondary btn-sm"
        >
          {recalculating ? 'Recalculating...' : 'Recalculate All'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-red-300">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>Model</th>
              <th>Provider</th>
              <th className="text-right">Score</th>
              <th className="text-right">Success Rate</th>
              <th className="text-right">Avg Latency</th>
              <th className="text-right">Samples</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((ranking, index) => (
              <tr key={ranking.modelId}>
                <td className="font-mono text-gray-500">{index + 1}</td>
                <td className="font-medium">{ranking.modelName}</td>
                <td className="text-gray-400">{ranking.providerName}</td>
                <td className={`text-right font-mono ${getScoreColor(ranking.score)}`}>
                  {ranking.score.toFixed(3)}
                </td>
                <td className={`text-right font-mono ${getSuccessRateColor(ranking.successRate)}`}>
                  {(ranking.successRate * 100).toFixed(1)}%
                </td>
                <td className="text-right font-mono text-gray-400">
                  {ranking.avgLatencyMs.toFixed(0)}ms
                </td>
                <td className="text-right text-gray-500">{ranking.sampleSize}</td>
              </tr>
            ))}
            {rankings.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-500 py-8">
                  No ranking data yet. Run some completions to generate rankings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-400">
        <p>
          <strong>Score formula:</strong> successRate × 0.4 + (1 - normalizedLatency) × 0.3 + qualityScore × 0.3
        </p>
        <p>Rankings are automatically recalculated every 100 requests per model.</p>
      </div>
    </div>
  );
}
