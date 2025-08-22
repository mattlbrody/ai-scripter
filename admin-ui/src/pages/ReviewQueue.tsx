import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Edit2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { clsx } from 'clsx';

interface ReviewItem {
  id: string;
  leadText: string;
  proposedIntent: string;
  proposedResponse: string;
  confidence: number;
  callId: string;
  timestamp: string;
}

export function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedResponse, setEditedResponse] = useState('');

  const { data: items, isLoading } = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => api.getReviewQueue()
  });

  const approveMutation = useMutation({
    mutationFn: (item: ReviewItem) => api.approveReviewItem(item.id, item.proposedResponse),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      setSelectedItem(null);
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectReviewItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      setSelectedItem(null);
    }
  });

  const handleApprove = (item: ReviewItem) => {
    const response = editMode ? editedResponse : item.proposedResponse;
    approveMutation.mutate({ ...item, proposedResponse: response });
    setEditMode(false);
  };

  const handleEdit = (item: ReviewItem) => {
    setEditedResponse(item.proposedResponse);
    setEditMode(true);
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return { color: 'bg-green-100 text-green-800', label: 'High' };
    if (confidence >= 0.6) return { color: 'bg-yellow-100 text-yellow-800', label: 'Medium' };
    return { color: 'bg-red-100 text-red-800', label: 'Low' };
  };

  if (isLoading) {
    return <div className="flex justify-center py-12">Loading review queue...</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Review Queue</h1>
        <p className="text-gray-600 mt-2">Approve or edit suggested responses before they go live</p>
      </div>

      {items?.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No items in review queue</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4">Pending Reviews ({items?.length || 0})</h2>
            {items?.map((item: ReviewItem) => {
              const badge = getConfidenceBadge(item.confidence);
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={clsx(
                    'bg-white rounded-lg shadow p-4 cursor-pointer transition-all',
                    selectedItem?.id === item.id ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-blue-600">{item.proposedIntent}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
                      {badge.label} ({(item.confidence * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                    <span className="font-medium">Lead:</span> "{item.leadText}"
                  </p>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    <span className="font-medium">Response:</span> "{item.proposedResponse}"
                  </p>
                </div>
              );
            })}
          </div>

          {selectedItem && (
            <div className="bg-white rounded-lg shadow p-6 h-fit sticky top-0">
              <h3 className="text-lg font-semibold mb-4">Review Details</h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-sm font-medium text-gray-700">Lead Statement</label>
                  <p className="mt-1 p-3 bg-gray-50 rounded text-sm">{selectedItem.leadText}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Detected Intent</label>
                  <p className="mt-1 p-3 bg-gray-50 rounded text-sm">{selectedItem.proposedIntent}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Suggested Response</label>
                  {editMode ? (
                    <textarea
                      value={editedResponse}
                      onChange={(e) => setEditedResponse(e.target.value)}
                      className="mt-1 w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={4}
                    />
                  ) : (
                    <p className="mt-1 p-3 bg-gray-50 rounded text-sm">{selectedItem.proposedResponse}</p>
                  )}
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Confidence</label>
                    <p className="text-sm text-gray-600">{(selectedItem.confidence * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Call ID</label>
                    <p className="text-sm text-gray-600">{selectedItem.callId.substring(0, 8)}...</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleApprove(selectedItem)}
                  disabled={approveMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {editMode ? 'Save & Approve' : 'Approve'}
                </button>
                
                {!editMode && (
                  <button
                    onClick={() => handleEdit(selectedItem)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                )}
                
                {editMode && (
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setEditedResponse('');
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                )}
                
                <button
                  onClick={() => rejectMutation.mutate(selectedItem.id)}
                  disabled={rejectMutation.isPending}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}