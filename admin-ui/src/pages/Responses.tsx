import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, MessageSquare, Star } from 'lucide-react';
import { api } from '../lib/api';

export function ResponsesPage() {
  const queryClient = useQueryClient();
  const [selectedIntent, setSelectedIntent] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newResponse, setNewResponse] = useState('');

  const { data: intents } = useQuery({
    queryKey: ['intents'],
    queryFn: () => api.getIntents()
  });

  const { data: responses } = useQuery({
    queryKey: ['responses', selectedIntent],
    queryFn: () => api.getResponses(selectedIntent)
  });

  const createMutation = useMutation({
    mutationFn: api.createResponse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['responses'] });
      setShowAddModal(false);
      setNewResponse('');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteResponse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['responses'] });
    }
  });

  const handleAddResponse = () => {
    if (!selectedIntent || !newResponse.trim()) return;
    createMutation.mutate({
      intentId: selectedIntent,
      text: newResponse
    });
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Responses</h1>
        <p className="text-gray-600 mt-2">Manage approved responses for each intent</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Filter by Intent:</label>
            <select
              value={selectedIntent}
              onChange={(e) => setSelectedIntent(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Intents</option>
              {intents?.map((intent: any) => (
                <option key={intent.id} value={intent.id}>
                  {intent.label}
                </option>
              ))}
            </select>
          </div>
          
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!selectedIntent}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add Response
          </button>
        </div>

        {!selectedIntent && (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">Select an intent to view responses</p>
          </div>
        )}
      </div>

      {selectedIntent && (
        <div className="grid grid-cols-1 gap-4">
          {responses?.map((response: any) => (
            <div key={response.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-gray-800 mb-3">{response.text}</p>
                  
                  <div className="flex items-center gap-6 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span>Rating: {response.rating.toFixed(2)}</span>
                    </div>
                    <span>Used {response.usageCount} times</span>
                    <span>Added {new Date(response.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <button
                  onClick={() => deleteMutation.mutate(response.id)}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          
          {responses?.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No responses for this intent yet</p>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-semibold mb-4">Add Response</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Intent: {intents?.find((i: any) => i.id === selectedIntent)?.label}
              </label>
              <textarea
                value={newResponse}
                onChange={(e) => setNewResponse(e.target.value)}
                placeholder="Enter the response text..."
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={4}
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleAddResponse}
                disabled={!newResponse.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                Add Response
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewResponse('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}