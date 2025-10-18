import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function TestUpload() {
  const [status, setStatus] = useState<string>('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);

  useEffect(() => {
    // Test basic connectivity
    testSupabaseConnection();
  }, []);

  const testSupabaseConnection = async () => {
    try {
      setStatus('Testing Supabase connection...');
      
      // Test auth
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError) {
        setError(`Auth error: ${authError.message}`);
        return;
      }
      
      if (!session) {
        setStatus('Not authenticated. Please log in first.');
        return;
      }
      
      setStatus(`Authenticated as: ${session.user.email}`);
      
      // Test storage bucket access
      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      if (bucketError) {
        setError(`Storage error: ${bucketError.message}`);
        return;
      }
      
      const callsBucket = buckets?.find(b => b.name === 'calls');
      if (!callsBucket) {
        setError('Storage bucket "calls" not found in bucket list');
        return;
      }
      
      setStatus(`✅ Connected! Bucket "calls" exists. Ready to upload.`);
    } catch (err: any) {
      setError(`Unexpected error: ${err.message}`);
    }
  };

  const handleTestUpload = async () => {
    if (!testFile) {
      setError('Please select a file first');
      return;
    }

    setStatus('Uploading...');
    setError(null);

    try {
      const fileName = `test-${Date.now()}-${testFile.name}`;
      
      console.log('Attempting upload with:', {
        fileName,
        fileSize: testFile.size,
        fileType: testFile.type
      });

      const { data, error: uploadError } = await supabase.storage
        .from('calls')
        .upload(fileName, testFile);

      if (uploadError) {
        console.error('Upload error full details:', uploadError);
        setError(`Upload failed: ${uploadError.message}`);
        
        // Try to get more details
        if ((uploadError as any).statusCode) {
          setError(prev => `${prev} (Status: ${(uploadError as any).statusCode})`);
        }
        return;
      }

      console.log('Upload successful:', data);
      setStatus(`✅ Upload successful! Path: ${data.path}`);
      
      // Try to get the public URL
      const { data: urlData } = supabase.storage
        .from('calls')
        .getPublicUrl(fileName);
      
      if (urlData?.publicUrl) {
        setStatus(prev => `${prev}\nPublic URL: ${urlData.publicUrl}`);
      }
    } catch (err: any) {
      console.error('Unexpected upload error:', err);
      setError(`Unexpected error: ${err.message}`);
    }
  };

  return (
    <div style={{ 
      position: 'fixed', 
      bottom: 20, 
      right: 20, 
      background: 'white', 
      border: '2px solid #ccc',
      borderRadius: 8,
      padding: 20,
      maxWidth: 400,
      zIndex: 9999,
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ margin: '0 0 10px 0' }}>🔧 Upload Test Panel</h3>
      
      <div style={{ marginBottom: 10 }}>
        <strong>Status:</strong> {status}
      </div>
      
      {error && (
        <div style={{ 
          background: '#fee', 
          border: '1px solid #fcc', 
          padding: 10, 
          borderRadius: 4,
          marginBottom: 10 
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div style={{ marginBottom: 10 }}>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            setTestFile(file);
            if (file) {
              setStatus(`File selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
            }
          }}
          style={{ marginBottom: 10 }}
        />
      </div>
      
      <button
        onClick={handleTestUpload}
        disabled={!testFile}
        style={{
          background: testFile ? '#4CAF50' : '#ccc',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: 4,
          cursor: testFile ? 'pointer' : 'not-allowed',
          marginRight: 10
        }}
      >
        Test Upload
      </button>
      
      <button
        onClick={testSupabaseConnection}
        style={{
          background: '#2196F3',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        Retest Connection
      </button>
    </div>
  );
}