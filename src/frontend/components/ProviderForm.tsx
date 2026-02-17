import React, { useState } from 'react';
import { Provider } from '../api';

interface Props {
  provider: Provider | null;
  onSave: (data: Partial<Provider>) => Promise<void>;
  onClose: () => void;
}

export default function ProviderForm({ provider, onSave, onClose }: Props) {
  const [formData, setFormData] = useState({
    name: provider?.name || '',
    slug: provider?.slug || '',
    baseUrl: provider?.baseUrl || '',
    apiKey: '',
    apiFormat: provider?.apiFormat || 'openai',
    authHeader: provider?.authHeader || 'Authorization',
    authPrefix: provider?.authPrefix || 'Bearer ',
    rateLimitRpm: provider?.rateLimitRpm?.toString() || '',
    rateLimitRpd: provider?.rateLimitRpd?.toString() || '',
    priority: provider?.priority?.toString() || '100',
    isEnabled: provider?.isEnabled !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const data: Partial<Provider> = {
        name: formData.name,
        slug: formData.slug,
        baseUrl: formData.baseUrl,
        apiFormat: formData.apiFormat,
        authHeader: formData.authHeader,
        authPrefix: formData.authPrefix,
        rateLimitRpm: formData.rateLimitRpm ? parseInt(formData.rateLimitRpm) : null,
        rateLimitRpd: formData.rateLimitRpd ? parseInt(formData.rateLimitRpd) : null,
        priority: parseInt(formData.priority) || 100,
        isEnabled: formData.isEnabled,
      };

      // Only include apiKey if it was changed
      if (formData.apiKey) {
        data.apiKey = formData.apiKey;
      }

      await onSave(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">
          {provider ? 'Edit Provider' : 'Add Provider'}
        </h2>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    name,
                    slug: prev.slug || generateSlug(name),
                  }));
                }}
                placeholder="My Provider"
                required
              />
            </div>
            <div>
              <label className="label">Slug</label>
              <input
                type="text"
                className="input"
                value={formData.slug}
                onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="my-provider"
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Base URL</label>
            <input
              type="url"
              className="input"
              value={formData.baseUrl}
              onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.example.com/v1/chat/completions"
              required
            />
          </div>

          <div>
            <label className="label">API Key {provider?.apiKey && '(leave empty to keep current)'}</label>
            <input
              type="password"
              className="input"
              value={formData.apiKey}
              onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder={provider?.apiKey ? '***configured***' : 'sk-...'}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">API Format</label>
              <select
                className="input"
                value={formData.apiFormat}
                onChange={(e) => setFormData((prev) => ({ ...prev, apiFormat: e.target.value }))}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="label">Auth Header</label>
              <input
                type="text"
                className="input"
                value={formData.authHeader}
                onChange={(e) => setFormData((prev) => ({ ...prev, authHeader: e.target.value }))}
                placeholder="Authorization"
              />
            </div>
            <div>
              <label className="label">Auth Prefix</label>
              <input
                type="text"
                className="input"
                value={formData.authPrefix}
                onChange={(e) => setFormData((prev) => ({ ...prev, authPrefix: e.target.value }))}
                placeholder="Bearer "
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">RPM Limit</label>
              <input
                type="number"
                className="input"
                value={formData.rateLimitRpm}
                onChange={(e) => setFormData((prev) => ({ ...prev, rateLimitRpm: e.target.value }))}
                placeholder="30"
              />
            </div>
            <div>
              <label className="label">RPD Limit</label>
              <input
                type="number"
                className="input"
                value={formData.rateLimitRpd}
                onChange={(e) => setFormData((prev) => ({ ...prev, rateLimitRpd: e.target.value }))}
                placeholder="14400"
              />
            </div>
            <div>
              <label className="label">Priority</label>
              <input
                type="number"
                className="input"
                value={formData.priority}
                onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value }))}
                placeholder="100"
              />
              <p className="text-xs text-gray-500 mt-1">Lower = higher priority</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isEnabled"
              checked={formData.isEnabled}
              onChange={(e) => setFormData((prev) => ({ ...prev, isEnabled: e.target.checked }))}
              className="rounded border-gray-600 bg-gray-700"
            />
            <label htmlFor="isEnabled" className="text-sm">
              Provider enabled
            </label>
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
