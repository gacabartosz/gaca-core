import React, { useState } from 'react';
import { ToastProvider } from './components/Toast';
import ProviderList from './components/ProviderList';
import RankingTable from './components/RankingTable';
import PromptEditor from './components/PromptEditor';
import TestPanel from './components/TestPanel';
import UsageStats from './components/UsageStats';

type Tab = 'providers' | 'ranking' | 'prompts' | 'test' | 'usage';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('providers');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'providers', label: 'Providers' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'prompts', label: 'Prompts' },
    { id: 'test', label: 'Test' },
    { id: 'usage', label: 'Usage' },
  ];

  return (
    <ToastProvider>
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <h1 className="text-xl font-bold text-white">GACA-Core</h1>
                <p className="text-sm text-gray-400">Universal AI Bus Settings</p>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              <a
                href="https://github.com/bartoszgaca/gaca-core"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                Documentation →
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab ${activeTab === tab.id ? 'tab-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'providers' && <ProviderList />}
        {activeTab === 'ranking' && <RankingTable />}
        {activeTab === 'prompts' && <PromptEditor />}
        {activeTab === 'test' && <TestPanel />}
        {activeTab === 'usage' && <UsageStats />}
      </main>
    </div>
    </ToastProvider>
  );
}

export default App;
