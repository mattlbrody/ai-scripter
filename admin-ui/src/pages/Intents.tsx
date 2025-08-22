import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Target } from 'lucide-react';
import { api } from '../lib/api';
import { clsx } from 'clsx';

export function IntentsPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingIntent, setEditingIntent] = useState<any>(null);
  const [formData, setFormData] = useState({
    label: '',
    description: '',
    threshold: 0.80
  });

  const { data: intents } = useQuery({
    queryKey: ['intents'],
    queryFn: () => api.getIntents()
  });

  const createMutation = useMutation({
    mutationFn: api.createIntent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      setShowCreateModal(false);
      setFormData({ label: '', description: '', threshold: 0.80 });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => api.updateIntent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      setEditingIntent(null);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIntent) {
      updateMutation.mutate({ id: editingIntent.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (intent: any) => {
    setEditingIntent(intent);
    setFormData({
      label: intent.label,
      description: intent.description,
      threshold: intent.threshold
    });
  };

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Intents</h1>
          <p className="text-gray-600 mt-2">Manage intent categories and thresholds</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add Intent
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {intents?.map((intent: any) => (
          <div key={intent.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Target className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">{intent.label}</h3>
              </div>
              <button
                onClick={() => handleEdit(intent)}
                className="text-gray-400 hover:text-gray-600"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">{intent.description}</p>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Threshold</span>
                <span className="font-medium">{(intent.threshold * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${intent.threshold * 100}%` }}
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className={clsx(
                'text-xs font-medium px-2 py-1 rounded',
                intent.isActive 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              )}>
                {intent.isActive ? 'Active' : 'Inactive'}
              </span>
              <button
                onClick={() => updateMutation.mutate({ 
                  id: intent.id, 
                  isActive: !intent.isActive 
                })}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {intent.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {(showCreateModal || editingIntent) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">
              {editingIntent ? 'Edit Intent' : 'Create Intent'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Threshold ({(formData.threshold * 100).toFixed(0)}%)
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={formData.threshold * 100}
                  onChange={(e) => setFormData({ ...formData, threshold: parseInt(e.target.value) / 100 })}
                  className="w-full"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingIntent ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingIntent(null);
                    setFormData({ label: '', description: '', threshold: 0.80 });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}