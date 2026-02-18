import React, { useState, useEffect } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import { api } from './api';
import ProviderList from './components/ProviderList';
import RankingTable from './components/RankingTable';
import PromptEditor from './components/PromptEditor';
import TestPanel from './components/TestPanel';
import UsageStats from './components/UsageStats';

type Tab = 'providers' | 'ranking' | 'prompts' | 'test' | 'usage';

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('providers');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const { addToast } = useToast();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'providers', label: 'Providers' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'prompts', label: 'Prompts' },
    { id: 'test', label: 'Test' },
    { id: 'usage', label: 'Usage' },
  ];

  useEffect(() => {
    loadSyncStatus();
  }, []);

  const loadSyncStatus = async () => {
    try {
      const data = await api.getSyncStatus();
      if (data.lastSync?.timestamp) {
        setLastSyncTime(data.lastSync.timestamp);
      }
    } catch {
      // Ignore — sync status is optional
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.syncProviders();
      addToast('Provider sync completed', 'success');
      setLastSyncTime(new Date().toISOString());
    } catch (e: any) {
      addToast(`Sync failed: ${e.message}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
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
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button onClick={handleSync} disabled={syncing} className="btn btn-secondary btn-sm">
                  {syncing ? 'Syncing...' : 'Sync Providers'}
                </button>
                {lastSyncTime && (
                  <span className="text-xs text-gray-500">Last: {new Date(lastSyncTime).toLocaleTimeString()}</span>
                )}
              </div>
              <a
                href="https://github.com/bartoszgaca/gaca-core"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-400 hover:text-white"
              >
                Documentation
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
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
