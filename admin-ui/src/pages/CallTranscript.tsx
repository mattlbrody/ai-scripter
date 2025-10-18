import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Phone, User, Calendar } from 'lucide-react';
import { useCall } from '../hooks/useCall';
import { useTurns } from '../hooks/useTurns';
import { formatDistanceToNow } from 'date-fns';

export function CallTranscriptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: call, isLoading: callLoading, error: callError } = useCall(id!);
  const { data: turns, isLoading: turnsLoading, error: turnsError } = useTurns(id!);


  if (callLoading || turnsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading transcript...</div>
      </div>
    );
  }

  if (callError || turnsError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading call: {callError?.message || turnsError?.message}</p>
          <Link to="/calls" className="text-blue-600 hover:text-blue-800 mt-2 inline-block">
            ← Back to calls
          </Link>
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Call not found</p>
          <Link to="/calls" className="text-blue-600 hover:text-blue-800 mt-2 inline-block">
            ← Back to calls
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link 
          to="/calls" 
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to calls
        </Link>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Call Transcript</h1>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              <Phone className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm font-medium">{call.phone_number || 'Unknown'}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Agent</p>
                <p className="text-sm font-medium">
                  {call.agent?.full_name || call.agent?.email || 'Unknown'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Duration</p>
                <p className="text-sm font-medium">
                  {call.duration_seconds 
                    ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}`
                    : 'N/A'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Started</p>
                <p className="text-sm font-medium">
                  {call.started_at 
                    ? formatDistanceToNow(new Date(call.started_at), { addSuffix: true })
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Transcript</h2>
        </div>
        
        <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
          {turns && turns.length > 0 ? (
            turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex ${turn.speaker === 'agent' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    turn.speaker === 'agent'
                      ? 'bg-blue-50 text-blue-900'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-semibold uppercase">
                      {turn.speaker}
                    </span>
                    {turn.start_ms && (
                      <span className="text-xs text-gray-500">
                        {Math.floor(turn.start_ms / 1000)}s
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
                  {turn.confidence && (
                    <p className="text-xs text-gray-500 mt-1">
                      Confidence: {(turn.confidence * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              No transcript available for this call
            </div>
          )}
        </div>
      </div>
    </div>
  );
}