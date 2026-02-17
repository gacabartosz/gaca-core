import React, { useState } from 'react';
import { api, Model } from '../api';
import ModelForm from './ModelForm';

interface Props {
  providerId: string;
  models: Model[];
  onRefresh: () => void;
}

export default function ModelList({ providerId, models, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (model: Model) => {
    try {
      await api.updateModel(model.id, { isEnabled: !model.isEnabled });
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSetDefault = async (model: Model) => {
    try {
      await api.updateModel(model.id, { isDefault: true });
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (modelId: string) => {
    if (!confirm('Are you sure you want to delete this model?')) return;
    try {
      await api.deleteModel(modelId);
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSave = async (data: Partial<Model>) => {
    try {
      if (editingModel) {
        await api.updateModel(editingModel.id, data);
      } else {
        await api.createModel({ ...data, providerId });
      }
      setShowForm(false);
      setEditingModel(null);
      onRefresh();
    } catch (e: any) {
      throw e;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-300">Models</h4>
        <button
          onClick={() => {
            setEditingModel(null);
            setShowForm(true);
          }}
          className="btn btn-secondary btn-sm"
        >
          + Add Model
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-2 mb-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Limits</th>
            <th>Stats</th>
            <th>Status</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id}>
              <td>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{model.displayName || model.name}</span>
                  {model.isDefault && <span className="badge badge-info">Default</span>}
                </div>
                <p className="text-xs text-gray-500">{model.name}</p>
              </td>
              <td className="text-sm text-gray-400">
                {model.rateLimitRpm && <div>{model.rateLimitRpm} RPM</div>}
                {model.rateLimitRpd && <div>{model.rateLimitRpd} RPD</div>}
              </td>
              <td className="text-sm">
                {model.ranking && (
                  <div>
                    <span className="text-green-400">{(model.ranking.successRate * 100).toFixed(0)}%</span>
                    <span className="text-gray-500"> • </span>
                    <span className="text-gray-400">{model.ranking.avgLatencyMs}ms</span>
                  </div>
                )}
                {model.usage && (
                  <div className="text-xs text-gray-500">
                    {model.usage.totalCalls} calls
                    {model.usage.totalTokensUsed > 0 && (
                      <span> • {model.usage.totalTokensUsed.toLocaleString()} tokens</span>
                    )}
                  </div>
                )}
              </td>
              <td>
                <button
                  onClick={() => handleToggle(model)}
                  className={`badge ${model.isEnabled ? 'badge-success' : 'badge-warning'}`}
                >
                  {model.isEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </td>
              <td className="text-right">
                <div className="flex justify-end gap-1">
                  {!model.isDefault && (
                    <button
                      onClick={() => handleSetDefault(model)}
                      className="btn btn-secondary btn-sm"
                      title="Set as default"
                    >
                      ⭐
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingModel(model);
                      setShowForm(true);
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(model.id)}
                    className="btn btn-danger btn-sm"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {models.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-gray-500 py-4">
                No models configured
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showForm && (
        <ModelForm
          model={editingModel}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingModel(null);
          }}
        />
      )}
    </div>
  );
}
