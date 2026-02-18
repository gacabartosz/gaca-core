import React from 'react';

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-700 rounded ${className}`} />;
}

export function ProviderListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bar className="w-10 h-6 rounded-full" />
              <div>
                <Bar className="h-4 w-32 mb-2" />
                <Bar className="h-3 w-48" />
              </div>
            </div>
            <div className="flex gap-2">
              <Bar className="h-8 w-14" />
              <Bar className="h-8 w-16" />
              <Bar className="h-8 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RankingTableSkeleton() {
  return (
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
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <tr key={i}>
              <td>
                <Bar className="h-4 w-6" />
              </td>
              <td>
                <Bar className="h-4 w-36" />
              </td>
              <td>
                <Bar className="h-4 w-24" />
              </td>
              <td className="text-right">
                <Bar className="h-4 w-14 ml-auto" />
              </td>
              <td className="text-right">
                <Bar className="h-4 w-14 ml-auto" />
              </td>
              <td className="text-right">
                <Bar className="h-4 w-16 ml-auto" />
              </td>
              <td className="text-right">
                <Bar className="h-4 w-8 ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsageStatsSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card">
            <Bar className="h-3 w-24 mb-2" />
            <Bar className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <Bar className="h-4 w-28 mb-3" />
              <Bar className="h-3 w-full" />
            </div>
          ))}
        </div>
        <div className="card">
          <Bar className="h-4 w-32 mb-4" />
          {[1, 2, 3].map((i) => (
            <Bar key={i} className="h-8 w-full mb-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
