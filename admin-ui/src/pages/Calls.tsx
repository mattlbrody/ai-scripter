import { useState } from 'react';
import { Upload, Phone, Clock, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { clsx } from 'clsx';

export function CallsPage() {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  
  // Manual state management
  const [calls, setCalls] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const fetchCalls = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await api.getCalls();
      setCalls(result || []);
      setHasLoadedOnce(true);
    } catch (err: any) {
      console.error('Error fetching calls:', err);
      setError(err.message);
      setCalls([]);
    } finally {
      setIsLoading(false);
    }
  };

  const refetch = fetchCalls;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const calculateTimeRemaining = () => {
    if (!uploadStartTime || uploadProgress === 0) return null;
    const elapsedTime = (Date.now() - uploadStartTime) / 1000;
    const estimatedTotalTime = (elapsedTime / uploadProgress) * 100;
    const remainingTime = estimatedTotalTime - elapsedTime;
    return remainingTime > 0 ? formatTime(remainingTime) : null;
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleUpload = async () => {
    console.log('handleUpload called, selectedFile:', selectedFile);
    if (!selectedFile) {
      console.log('No file selected, returning early');
      return;
    }
    
    console.log('Starting processing for file:', {
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type
    });
    
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    setUploadProgress(0);
    setUploadStartTime(Date.now());
    setUploadStatus('Initializing...');
    
    try {
      console.log('Processing file directly via Deepgram...');
      const result = await api.processCallDirectly(selectedFile, (progress) => {
        setUploadProgress(progress);
        
        // Update status message based on progress
        if (progress < 20) setUploadStatus('Reading audio file...');
        else if (progress < 40) setUploadStatus('Preparing for transcription...');
        else if (progress < 60) setUploadStatus('Transcribing with Deepgram...');
        else if (progress < 80) setUploadStatus('Processing transcript...');
        else if (progress < 90) setUploadStatus('Saving to database...');
        else setUploadStatus('Finalizing...');
      });
      console.log('Processing result:', result);
      
      setSelectedFile(null);
      setUploadSuccess(true);
      setUploadProgress(0);
      setUploadStartTime(null);
      setUploadStatus('');
      // Clear success message after 5 seconds
      setTimeout(() => setUploadSuccess(false), 5000);
      refetch();
    } catch (error: any) {
      console.error('Upload failed with full error:', error);
      console.error('Error stack:', error?.stack);
      const errorMessage = error?.message || 'Upload failed. Please try again.';
      setUploadError(errorMessage);
      setUploadProgress(0);
      setUploadStartTime(null);
      setUploadStatus('');
    } finally {
      console.log('Upload complete, setting uploading to false');
      setUploading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      processing: 'bg-yellow-100 text-yellow-800',
      ready: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800'
    };
    return colors[status as keyof typeof colors] || colors.archived;
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Calls</h1>
            <p className="text-gray-600 mt-2">Upload and manage call recordings</p>
          </div>
          <button
            onClick={fetchCalls}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {!hasLoadedOnce ? 'Load Calls' : 'Refresh'}
          </button>
        </div>
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-800">Error: {error}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6 relative">
        {uploading && (
          <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10 rounded-lg">
            <div className="w-full max-w-md px-6">
              <div className="text-center mb-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                <p className="text-lg font-medium text-gray-900">
                  Processing {selectedFile?.name}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedFile && formatFileSize(selectedFile.size)}
                </p>
                {uploadStatus && (
                  <p className="text-sm text-blue-600 font-medium mt-2">
                    {uploadStatus}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Progress</span>
                  <span className="font-medium text-gray-900">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                {uploadProgress > 40 && uploadProgress < 60 && (
                  <p className="text-sm text-gray-500 text-center pt-1">
                    Transcribing audio with Deepgram Nova-2...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <h2 className="text-lg font-semibold mb-4">Upload Call Recording</h2>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              console.log('File selected:', file);
              setSelectedFile(file);
            }}
            className="flex-1 px-4 py-2 border rounded-lg text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button
            onClick={() => {
              console.log('Process button clicked, selectedFile:', selectedFile);
              handleUpload();
            }}
            disabled={!selectedFile || uploading}
            className={clsx(
              'flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors',
              selectedFile && !uploading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Process
              </>
            )}
          </button>
        </div>
        {selectedFile && (
          <p className="text-sm text-blue-600 mt-2">
            File size: {formatFileSize(selectedFile.size)} • Will be processed directly via Deepgram
          </p>
        )}
        <p className="text-sm text-gray-500 mt-1">
          Supported formats: MP3, WAV, M4A, OGG • All files are processed without storage
        </p>
        {uploadSuccess && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              <p className="text-sm text-green-800">File uploaded successfully! Processing will begin shortly.</p>
            </div>
          </div>
        )}
        {uploadError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-800">{uploadError}</p>
                {uploadError.includes('storage bucket') && (
                  <p className="text-sm text-red-600 mt-2">
                    <strong>To fix this:</strong> Go to your Supabase dashboard → Storage → Create a new bucket called "calls"
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Call ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Agent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {calls?.map((call: any) => (
              <tr key={call.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Phone className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-sm font-medium text-gray-900">
                      {call.id.substring(0, 8)}...
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {call.agent_name || 'Unknown'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, '0')}` : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={clsx(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                    getStatusBadge(call.status)
                  )}>
                    {getStatusIcon(call.status)}
                    {call.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {new Date(call.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => window.location.href = `/calls/${call.id}`}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    View Transcript
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {(!calls || calls.length === 0) && (
          <div className="text-center py-12">
            <Phone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No calls uploaded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}