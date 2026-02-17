import React, { useState, useEffect } from 'react';
import { api, Prompt } from '../api';

export default function PromptEditor() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPromptName, setNewPromptName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const data = await api.getPrompts();
      setPrompts(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPromptContent = async (name: string) => {
    try {
      const data = await api.getPrompt(name);
      setContent(data.content);
      setSelectedPrompt(name);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSave = async () => {
    if (!selectedPrompt) return;

    setSaving(true);
    try {
      await api.savePrompt(selectedPrompt, content);
      await loadPrompts();
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newPromptName.trim()) return;

    setSaving(true);
    try {
      await api.savePrompt(newPromptName, 'Enter your prompt here...');
      await loadPrompts();
      setNewPromptName('');
      setShowNewForm(false);
      loadPromptContent(newPromptName);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete prompt "${name}"?`)) return;

    try {
      await api.deletePrompt(name);
      if (selectedPrompt === name) {
        setSelectedPrompt(null);
        setContent('');
      }
      await loadPrompts();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading prompts...</div>;
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Sidebar */}
      <div className="col-span-1">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Prompts</h3>
            <button
              onClick={() => setShowNewForm(true)}
              className="btn btn-secondary btn-sm"
            >
              +
            </button>
          </div>

          {showNewForm && (
            <div className="mb-3 p-2 bg-gray-700 rounded">
              <input
                type="text"
                className="input mb-2"
                placeholder="Prompt name"
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <div className="flex gap-1">
                <button onClick={handleCreate} className="btn btn-primary btn-sm flex-1">
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewForm(false);
                    setNewPromptName('');
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {prompts.map((prompt) => (
              <div
                key={prompt.name}
                className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                  selectedPrompt === prompt.name ? 'bg-blue-900/50' : 'hover:bg-gray-700'
                }`}
                onClick={() => loadPromptContent(prompt.name)}
              >
                <div className="flex items-center gap-2">
                  <span>{prompt.name}</span>
                  {!prompt.isCustom && (
                    <span className="badge badge-info text-xs">Default</span>
                  )}
                </div>
                {prompt.isCustom && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(prompt.name);
                    }}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="col-span-3">
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-red-300">
            {error}
          </div>
        )}

        {selectedPrompt ? (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">{selectedPrompt}</h3>
              {prompts.find((p) => p.name === selectedPrompt)?.isCustom && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary btn-sm"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
            <textarea
              className="input font-mono text-sm"
              rows={20}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!prompts.find((p) => p.name === selectedPrompt)?.isCustom}
            />
            {!prompts.find((p) => p.name === selectedPrompt)?.isCustom && (
              <p className="text-sm text-gray-500 mt-2">
                Default prompts cannot be edited. Create a custom prompt to modify.
              </p>
            )}
          </div>
        ) : (
          <div className="card text-center py-16 text-gray-500">
            Select a prompt to view or edit
          </div>
        )}
      </div>
    </div>
  );
}
