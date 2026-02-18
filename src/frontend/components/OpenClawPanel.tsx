import React, { useState, useEffect, useRef } from 'react';

interface BridgeHealth {
  connected: boolean;
  gatewayUrl: string | null;
  connectedSince: string | null;
  messagesSent: number;
  messagesReceived: number;
  lastError: string | null;
}

interface ClawMessage {
  id: string;
  text: string;
  from: 'gaca-core' | 'claw';
  timestamp: string;
}

const API_BASE = '/api';

export default function OpenClawPanel() {
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [history, setHistory] = useState<ClawMessage[]>([]);
  const [message, setMessage] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState('ws://127.0.0.1:18789');
  const [gatewayToken, setGatewayToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/openclaw/status`);
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/openclaw/history`);
      const data = await res.json();
      setHistory(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/openclaw/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gatewayUrl, token: gatewayToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/openclaw/disconnect`, { method: 'POST' });
      await fetchStatus();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/openclaw/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('');
      await fetchHistory();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const connected = health?.connected ?? false;

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-xl">🦞</span>
            OpenClaw Bridge
          </h2>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className={`text-sm font-medium ${connected ? 'text-green-400' : 'text-red-400'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {health && connected && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-700 rounded p-3">
              <div className="text-xs text-gray-400">Gateway</div>
              <div className="text-sm text-white font-mono truncate">{health.gatewayUrl}</div>
            </div>
            <div className="bg-gray-700 rounded p-3">
              <div className="text-xs text-gray-400">Connected Since</div>
              <div className="text-sm text-white">
                {health.connectedSince ? new Date(health.connectedSince).toLocaleTimeString() : '-'}
              </div>
            </div>
            <div className="bg-gray-700 rounded p-3">
              <div className="text-xs text-gray-400">Sent</div>
              <div className="text-sm text-white">{health.messagesSent}</div>
            </div>
            <div className="bg-gray-700 rounded p-3">
              <div className="text-xs text-gray-400">Received</div>
              <div className="text-sm text-white">{health.messagesReceived}</div>
            </div>
          </div>
        )}

        {!connected && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Gateway URL</label>
              <input
                type="text"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                className="input w-full"
                placeholder="ws://127.0.0.1:18789"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Gateway Token</label>
              <input
                type="password"
                value={gatewayToken}
                onChange={(e) => setGatewayToken(e.target.value)}
                className="input w-full"
                placeholder="Token from OpenClaw config"
              />
            </div>
            <button onClick={handleConnect} disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Connecting...' : 'Connect to Gateway'}
            </button>
          </div>
        )}

        {connected && (
          <button onClick={handleDisconnect} disabled={loading} className="btn bg-red-600 hover:bg-red-700 text-white text-sm">
            Disconnect
          </button>
        )}

        {health?.lastError && (
          <div className="mt-3 text-sm text-red-400 bg-red-900/20 rounded p-2">{health.lastError}</div>
        )}
      </div>

      {/* Chat */}
      {connected && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">Chat with Claw</h3>
          <div className="bg-gray-900 rounded-lg p-4 h-80 overflow-y-auto mb-4 space-y-3">
            {history.length === 0 && (
              <div className="text-gray-500 text-center text-sm py-8">
                No messages yet. Send a message to start chatting with Claw.
              </div>
            )}
            {history.map((msg) => (
              <div key={msg.id} className={`flex ${msg.from === 'gaca-core' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${msg.from === 'gaca-core' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs opacity-70">{msg.from === 'claw' ? '🦞 Claw' : '🤖 gaca-core'}</span>
                    <span className="text-xs opacity-50">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input flex-1"
              placeholder="Type a message..."
            />
            <button type="submit" className="btn btn-primary">Send</button>
          </form>
        </div>
      )}

      {error && <div className="text-sm text-red-400 bg-red-900/20 rounded p-3">{error}</div>}
    </div>
  );
}
