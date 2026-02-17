import React, { useState } from 'react';
import { Model } from '../api';

interface Props {
  model: Model | null;
  onSave: (data: Partial<Model>) => Promise<void>;
  onClose: () => void;
}

export default function ModelForm({ model, onSave, onClose }: Props) {
  const [formData, setFormData] = useState({
    name: model?.name || '',
    displayName: model?.displayName || '',
    rateLimitRpm: model?.rateLimitRpm?.toString() || '',
    rateLimitRpd: model?.rateLimitRpd?.toString() || '',
    costPer1kInput: model?.costPer1kInput?.toString() || '0',
    costPer1kOutput: model?.costPer1kOutput?.toString() || '0',
    maxTokens: model?.maxTokens?.toString() || '4096',
    contextWindow: model?.contextWindow?.toString() || '8192',
    isEnabled: model?.isEnabled !== false,
    isDefault: model?.isDefault || false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onSave({
        name: formData.name,
        displayName: formData.displayName || null,
        rateLimitRpm: formData.rateLimitRpm ? parseInt(formData.rateLimitRpm) : null,
        rateLimitRpd: formData.rateLimitRpd ? parseInt(formData.rateLimitRpd) : null,
        costPer1kInput: parseFloat(formData.costPer1kInput) || 0,
        costPer1kOutput: parseFloat(formData.costPer1kOutput) || 0,
        maxTokens: parseInt(formData.maxTokens) || 4096,
        contextWindow: parseInt(formData.contextWindow) || 8192,
        isEnabled: formData.isEnabled,
        isDefault: formData.isDefault,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">
          {model ? 'Edit Model' : 'Add Model'}
        </h2>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Model ID (API)</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="llama-3.3-70b-versatile"
                required
              />
            </div>
            <div>
              <label className="label">Display Name</label>
              <input
                type="text"
                className="input"
                value={formData.displayName}
                onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="Llama 3.3 70B"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">RPM Limit (per model)</label>
              <input
                type="number"
                className="input"
                value={formData.rateLimitRpm}
                onChange={(e) => setFormData((prev) => ({ ...prev, rateLimitRpm: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="label">RPD Limit (per model)</label>
              <input
                type="number"
                className="input"
                value={formData.rateLimitRpd}
                onChange={(e) => setFormData((prev) => ({ ...prev, rateLimitRpd: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Cost per 1K input tokens ($)</label>
              <input
                type="number"
                step="0.0001"
                className="input"
                value={formData.costPer1kInput}
                onChange={(e) => setFormData((prev) => ({ ...prev, costPer1kInput: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Cost per 1K output tokens ($)</label>
              <input
                type="number"
                step="0.0001"
                className="input"
                value={formData.costPer1kOutput}
                onChange={(e) => setFormData((prev) => ({ ...prev, costPer1kOutput: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Max Output Tokens</label>
              <input
                type="number"
                className="input"
                value={formData.maxTokens}
                onChange={(e) => setFormData((prev) => ({ ...prev, maxTokens: e.target.value }))}
                placeholder="4096"
              />
            </div>
            <div>
              <label className="label">Context Window</label>
              <input
                type="number"
                className="input"
                value={formData.contextWindow}
                onChange={(e) => setFormData((prev) => ({ ...prev, contextWindow: e.target.value }))}
                placeholder="8192"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isEnabled"
                checked={formData.isEnabled}
                onChange={(e) => setFormData((prev) => ({ ...prev, isEnabled: e.target.checked }))}
                className="rounded border-gray-600 bg-gray-700"
              />
              <label htmlFor="isEnabled" className="text-sm">
                Enabled
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e) => setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))}
                className="rounded border-gray-600 bg-gray-700"
              />
              <label htmlFor="isDefault" className="text-sm">
                Default model for provider
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
