import { supabase } from './supabase';

// Helper to get current user's org with better error handling
async function getCurrentOrg() {
  try {
    // First get the session to ensure we have valid auth
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.error('Session error:', sessionError);
      throw new Error('Not authenticated');
    }
    
    // Use the user from the session instead of making another call
    const user = session.user;
    if (!user) {
      throw new Error('Not authenticated');
    }
    
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single();
    
    if (membershipError) {
      console.error('Membership error:', membershipError);
      
      // If it's a permission error, provide instructions
      if (membershipError.code === '42501') {
        console.error('RLS Policy Error: User does not have permission to read memberships table.');
        console.error('To fix this, run the fix-rls-policies.sql script in your Supabase SQL editor.');
        throw new Error('Database permissions not configured. Please contact your administrator.');
      }
      
      // If no membership found, we might need to create one
      if (membershipError.code === 'PGRST116') {
        console.error('No membership found for user. Creating default membership...');
        // For now, just throw an error. In production, you might want to create a default org
        throw new Error('No organization membership found. Please contact your administrator to be added to an organization.');
      }
      
      throw new Error('No organization membership found');
    }
    
    if (!membership) {
      console.error('Membership is null/undefined');
      throw new Error('No organization membership found');
    }
    
    return {
      org_id: membership.org_id,
      role: membership.role
    };
  } catch (error) {
    console.error('Error getting current org:', error);
    throw error;
  }
}

export const api = {
  async getStats() {
    try {
      const org = await getCurrentOrg();
      
      const [calls, suggestions, intents] = await Promise.all([
        supabase.from('calls').select('id', { count: 'exact' }).eq('org_id', org.org_id),
        supabase.from('suggestions').select('id', { count: 'exact' }).eq('org_id', org.org_id).eq('decision', 'suggestion'),
        supabase.from('intents').select('id', { count: 'exact' }).eq('org_id', org.org_id).eq('is_active', true)
      ]);
      
      return {
        totalCalls: calls.count || 0,
        suggestionsShown: suggestions.count || 0,
        activeIntents: intents.count || 0,
        successRate: 85 // Mock for now
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        totalCalls: 0,
        suggestionsShown: 0,
        activeIntents: 0,
        successRate: 0
      };
    }
  },
  
  async getCalls(params?: { status?: string; limit?: number }) {
    try {
      const org = await getCurrentOrg();
      
      const query = supabase
        .from('calls')
        .select('*')
        .eq('org_id', org.org_id)
        .order('created_at', { ascending: false });
      
      if (params?.status) query.eq('status', params.status);
      if (params?.limit) query.limit(params.limit);
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching calls:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('Error in getCalls:', error);
      return [];
    }
  },
  
  async processCallDirectly(file: File, onProgress?: (progress: number) => void) {
    console.log('processCallDirectly started with file:', file.name);
    try {
      const org = await getCurrentOrg();
      console.log('Current org:', org);
      
      // Check file type
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg)$/i)) {
        throw new Error('Invalid file format. Please upload MP3, WAV, M4A, or OGG files.');
      }
      
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      console.log(`Processing file directly: ${file.name} (${fileSizeMB}MB)`);
      
      // Create call record without audio_url
      console.log('Creating call record for processing...');
      const { data: call, error: callError } = await supabase
        .from('calls')
        .insert({
          org_id: org.org_id,
          audio_url: null, // No storage URL
          status: 'processing',
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            processedLocally: true
          }
        })
        .select()
        .single();
      
      if (callError) {
        console.error('Error creating call record:', callError);
        throw new Error(`Failed to create call record: ${callError.message}`);
      }
      
      // Stream directly to Deepgram for transcription
      console.log('Starting Deepgram transcription...');
      
      try {
        // For security, we should proxy through backend instead of exposing API key
        // But for now, if you want to test, add VITE_DEEPGRAM_API_KEY to your .env
        const deepgramKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
        
        if (!deepgramKey) {
          // Fallback: Use backend proxy (more secure)
          console.log('Using backend proxy for Deepgram...');
          
          // Create FormData to send file
          const formData = new FormData();
          formData.append('audio', file);
          formData.append('callId', call.id);
          
          if (onProgress) onProgress(30);
          
          // Get the current session token
          const { data: { session } } = await supabase.auth.getSession();
          
          const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/transcribe`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: formData
          });
          
          if (!response.ok) {
            throw new Error(`Backend transcription error: ${response.statusText}`);
          }
          
          const transcription = await response.json();
          console.log('Transcription complete via backend:', transcription);
          
          // The backend should handle turn extraction and database updates
          if (onProgress) onProgress(90);
          
          // Update call status
          await supabase
            .from('calls')
            .update({ 
              status: 'ready',
              metadata: {
                fileName: file.name,
                fileSize: file.size,
                processedLocally: true,
                transcribedViaBackend: true
              }
            })
            .eq('id', call.id);
            
          if (onProgress) onProgress(100);
          return call;
        }
        
        // Direct Deepgram API call (less secure, exposes API key)
        console.log('Using direct Deepgram API...');
        
        // Progress: Reading file
        if (onProgress) onProgress(10);
        
        // Convert file to base64 for Deepgram API
        const arrayBuffer = await file.arrayBuffer();
        
        // Progress: Converting to base64
        if (onProgress) onProgress(20);
        
        const base64Audio = btoa(
          new Uint8Array(arrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        // Progress: Preparing for Deepgram
        if (onProgress) onProgress(30);
        
        // Progress: Sending to Deepgram
        if (onProgress) onProgress(40);
        
        // Call Deepgram API directly from browser
        const deepgramResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            audio: base64Audio
          })
        });
        
        if (!deepgramResponse.ok) {
          throw new Error(`Deepgram API error: ${deepgramResponse.statusText}`);
        }
        
        // Progress: Received transcription
        if (onProgress) onProgress(60);
        
        const transcription = await deepgramResponse.json();
        console.log('Transcription complete:', transcription);
        console.log('Transcription results structure:', {
          hasResults: !!transcription.results,
          channels: transcription.results?.channels?.length || 0,
          hasAlternatives: !!transcription.results?.channels?.[0]?.alternatives,
          hasWords: !!transcription.results?.channels?.[0]?.alternatives?.[0]?.words,
          wordCount: transcription.results?.channels?.[0]?.alternatives?.[0]?.words?.length || 0
        });
        
        // Progress: Processing transcription
        if (onProgress) onProgress(70);
        
        // Process the transcription to extract turns
        const turns = this.extractTurnsFromTranscription(transcription, call.id, org.org_id);
        
        // Progress: Saving to database
        if (onProgress) onProgress(80);
        
        // Insert turns into database
        console.log('Extracted turns:', turns);
        if (turns.length > 0) {
          const { data: insertedTurns, error: turnsError } = await supabase
            .from('turns')
            .insert(turns)
            .select();
          
          if (turnsError) {
            console.error('Error inserting turns:', turnsError);
            throw turnsError;
          } else {
            console.log('Successfully inserted turns:', insertedTurns);
          }
        } else {
          console.warn('No turns extracted from transcription');
        }
        
        // Progress: Finalizing
        if (onProgress) onProgress(90);
        
        // Update call with transcription metadata
        await supabase
          .from('calls')
          .update({ 
            status: 'ready',
            duration_seconds: Math.round(transcription.metadata?.duration || 0),
            metadata: {
              fileName: file.name,
              fileSize: file.size,
              processedLocally: true,
              transcriptionConfidence: transcription.metadata?.confidence || 0,
              wordCount: transcription.results?.channels?.[0]?.alternatives?.[0]?.words?.length || 0
            }
          })
          .eq('id', call.id);
        
        if (onProgress) onProgress(100);
        
        return call;
      } catch (transcriptionError) {
        console.error('Transcription failed:', transcriptionError);
        
        // Update call status to failed
        await supabase
          .from('calls')
          .update({ 
            status: 'failed',
            metadata: {
              fileName: file.name,
              fileSize: file.size,
              error: transcriptionError.message
            }
          })
          .eq('id', call.id);
        
        throw new Error(`Transcription failed: ${transcriptionError.message}`);
      }
    } catch (error) {
      console.error('Error processing call:', error);
      throw error;
    }
  },
  
  extractTurnsFromTranscription(transcription: any, callId: string, orgId: string) {
    const turns = [];
    const channels = transcription.results?.channels || [];
    
    // Process each channel (for diarization)
    channels.forEach((channel, channelIndex) => {
      const alternatives = channel.alternatives || [];
      alternatives.forEach(alt => {
        const words = alt.words || [];
        
        // Group words into turns based on speaker
        let currentTurn = null;
        let turnText = '';
        let turnStart = 0;
        let turnEnd = 0;
        
        words.forEach((word, index) => {
          const speaker = word.speaker !== undefined ? 
            (word.speaker === 0 ? 'agent' : 'lead') : 
            (channelIndex === 0 ? 'agent' : 'lead');
          
          if (!currentTurn || currentTurn !== speaker) {
            // Save previous turn if exists
            if (currentTurn && turnText) {
              turns.push({
                call_id: callId,
                org_id: orgId,
                speaker: currentTurn,
                text: turnText.trim(),
                start_ms: Math.round(turnStart * 1000),
                end_ms: Math.round(turnEnd * 1000),
                confidence: alt.confidence || 0
              });
            }
            
            // Start new turn
            currentTurn = speaker;
            turnText = word.punctuated_word || word.word;
            turnStart = word.start;
            turnEnd = word.end;
          } else {
            // Continue current turn
            turnText += ' ' + (word.punctuated_word || word.word);
            turnEnd = word.end;
          }
          
          // Save last turn
          if (index === words.length - 1 && turnText) {
            turns.push({
              call_id: callId,
              org_id: orgId,
              speaker: currentTurn,
              text: turnText.trim(),
              start_ms: Math.round(turnStart * 1000),
              end_ms: Math.round(turnEnd * 1000),
              confidence: alt.confidence || 0
            });
          }
        });
      });
    });
    
    return turns;
  },

  async uploadCall(file: File, onProgress?: (progress: number) => void) {
    console.log('uploadCall started with file:', file.name);
    try {
      const org = await getCurrentOrg();
      console.log('Current org:', org);
      
      // Check file size (50MB max for Supabase free tier, 100MB for pro)
      const maxSize = 50 * 1024 * 1024; // 50MB in bytes
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      console.log(`File size: ${fileSizeMB}MB`);
      
      if (file.size > maxSize) {
        throw new Error(`File size (${fileSizeMB}MB) exceeds 50MB limit. For larger files, upgrade your Supabase plan or split the audio file.`);
      }
      
      // Check file type
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg)$/i)) {
        throw new Error('Invalid file format. Please upload MP3, WAV, M4A, or OGG files.');
      }
      
      // First, check if the storage bucket exists
      console.log('Checking storage bucket status...');
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      console.log('Available buckets:', buckets?.map(b => b.name));
      if (bucketsError) {
        console.error('Error listing buckets:', bucketsError);
      }
      
      // Check if 'calls' bucket exists
      const callsBucket = buckets?.find(b => b.name === 'calls');
      if (!callsBucket) {
        throw new Error('Storage bucket "calls" does not exist. Please create it in your Supabase dashboard with public access.');
      }
      console.log('Calls bucket found:', callsBucket);
      
      // Upload to Supabase Storage
      const fileName = `${Date.now()}-${file.name}`;
      console.log('Attempting to upload file to storage:', fileName);
      
      // Simulate progress for better UX (since Supabase SDK doesn't provide real progress)
      let progress = 0;
      const progressInterval = setInterval(() => {
        if (progress < 90) {
          progress += Math.random() * 10;
          if (onProgress) onProgress(Math.min(progress, 90));
        }
      }, 500);
      
      console.log('Starting storage upload...', {
        fileName,
        fileSize: `${fileSizeMB}MB`,
        fileType: file.type
      });
      
      const { data: upload, error: uploadError } = await supabase.storage
        .from('calls')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      clearInterval(progressInterval);
      if (onProgress) onProgress(100);
      
      console.log('Storage upload result:', { data: upload, error: uploadError });
      
      if (uploadError) {
        console.error('Storage upload error details:', {
          message: uploadError.message,
          error: uploadError,
          statusCode: (uploadError as any)?.statusCode,
          details: (uploadError as any)?.details
        });
        
        // Check for specific error types
        if (uploadError.message?.includes('exceeded the maximum allowed size') || 
            (uploadError as any)?.statusCode === '413') {
          throw new Error(`File too large (${fileSizeMB}MB). Supabase free tier limit is 50MB, Pro is 100MB. Please compress the audio or upgrade your plan.`);
        }
        
        if (uploadError.message?.includes('not found') || 
            uploadError.message?.includes('bucket') ||
            (uploadError as any)?.statusCode === 404) {
          throw new Error('Storage bucket "calls" not found. Please create it in your Supabase dashboard.');
        }
        
        throw new Error(`Failed to upload file: ${uploadError.message || 'Unknown error'}`);
      }
      
      // Create call record
      console.log('Creating call record with:', {
        org_id: org.org_id,
        audio_url: upload?.path,
        status: 'processing'
      });
      
      const { data: call, error: callError } = await supabase
        .from('calls')
        .insert({
          org_id: org.org_id,
          audio_url: upload?.path,
          status: 'processing'
        })
        .select()
        .single();
      
      console.log('Call record result:', { data: call, error: callError });
      
      if (callError) {
        console.error('Error creating call record:', callError);
        throw new Error(`Failed to create call record: ${callError.message}`);
      }
      
      // Try to trigger processing (will fail if edge function not deployed)
      try {
        await supabase.functions.invoke('process-audio', {
          body: { 
            audioUrl: upload?.path,
            callId: call.id,
            orgId: org.org_id
          }
        });
      } catch (fnError) {
        console.warn('Edge function not available:', fnError);
        // Continue anyway - call record is created
      }
      
      return call;
    } catch (error) {
      console.error('Error uploading call:', error);
      throw error;
    }
  },
  
  async getReviewQueue() {
    try {
      const org = await getCurrentOrg();
      const { data, error } = await supabase
        .from('review_queue')
        .select(`
          *,
          intents(label)
        `)
        .eq('org_id', org.org_id)
        .eq('status', 'pending')
        .order('confidence', { ascending: true });
      
      if (error) {
        console.error('Error fetching review queue:', error);
        return [];
      }
      
      return data?.map(item => ({
        id: item.id,
        leadText: item.lead_text,
        proposedIntent: item.intents?.label,
        proposedResponse: item.proposed_response,
        confidence: item.confidence,
        callId: item.call_id,
        timestamp: item.created_at
      })) || [];
    } catch (error) {
      console.error('Error in getReviewQueue:', error);
      return [];
    }
  },
  
  async approveReviewItem(id: string, response: string) {
    try {
      const org = await getCurrentOrg();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
      // Get the review item
      const { data: item, error: itemError } = await supabase
        .from('review_queue')
        .select('*')
        .eq('id', id)
        .single();
      
      if (itemError) {
        console.error('Error fetching review item:', itemError);
        throw itemError;
      }
      
      // Create response
      const { data: newResponse, error: responseError } = await supabase
        .from('responses')
        .insert({
          org_id: org.org_id,
          intent_id: item.proposed_intent_id,
          text: response,
          source_call_id: item.call_id,
          source_turn_id: item.turn_id
        })
        .select()
        .single();
      
      if (responseError) {
        console.error('Error creating response:', responseError);
        throw responseError;
      }
      
      // Try to generate embedding (will fail if edge function not deployed)
      try {
        await supabase.functions.invoke('generate-embedding', {
          body: { 
            text: response,
            responseId: newResponse.id,
            orgId: org.org_id
          }
        });
      } catch (fnError) {
        console.warn('Edge function not available:', fnError);
      }
      
      // Update review item
      const { error: updateError } = await supabase
        .from('review_queue')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (updateError) {
        console.error('Error updating review item:', updateError);
        throw updateError;
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error in approveReviewItem:', error);
      throw error;
    }
  },
  
  async rejectReviewItem(id: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
      const { error } = await supabase
        .from('review_queue')
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) {
        console.error('Error rejecting review item:', error);
        throw error;
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error in rejectReviewItem:', error);
      throw error;
    }
  },
  
  async getIntents() {
    try {
      const org = await getCurrentOrg();
      const { data, error } = await supabase
        .from('intents')
        .select('*')
        .eq('org_id', org.org_id)
        .order('label');
      
      if (error) {
        console.error('Error fetching intents:', error);
        return [];
      }
      
      return data?.map(intent => ({
        id: intent.id,
        label: intent.label,
        description: intent.description,
        threshold: intent.threshold,
        isActive: intent.is_active,
        createdAt: intent.created_at
      })) || [];
    } catch (error) {
      console.error('Error in getIntents:', error);
      return [];
    }
  },
  
  async createIntent(data: { label: string; description: string; threshold: number }) {
    try {
      const org = await getCurrentOrg();
      const { data: intent, error } = await supabase
        .from('intents')
        .insert({
          org_id: org.org_id,
          ...data
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating intent:', error);
        throw error;
      }
      
      return { id: intent.id, success: true };
    } catch (error) {
      console.error('Error in createIntent:', error);
      throw error;
    }
  },
  
  async updateIntent(id: string, data: Partial<{ label: string; threshold: number; isActive: boolean }>) {
    try {
      const updates: any = {};
      if (data.label) updates.label = data.label;
      if (data.threshold) updates.threshold = data.threshold;
      if (data.isActive !== undefined) updates.is_active = data.isActive;
      
      const { error } = await supabase
        .from('intents')
        .update(updates)
        .eq('id', id);
      
      if (error) {
        console.error('Error updating intent:', error);
        throw error;
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error in updateIntent:', error);
      throw error;
    }
  },
  
  async getResponses(intentId?: string) {
    try {
      const org = await getCurrentOrg();
      let query = supabase
        .from('responses')
        .select('*')
        .eq('org_id', org.org_id);
      
      if (intentId) query = query.eq('intent_id', intentId);
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching responses:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Error in getResponses:', error);
      return [];
    }
  },
  
  async createResponse(data: { intentId: string; text: string }) {
    try {
      const org = await getCurrentOrg();
      const { data: response, error } = await supabase
        .from('responses')
        .insert({
          org_id: org.org_id,
          intent_id: data.intentId,
          text: data.text
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating response:', error);
        throw error;
      }
      
      // Try to generate embedding (will fail if edge function not deployed)
      try {
        await supabase.functions.invoke('generate-embedding', {
          body: { 
            text: data.text,
            responseId: response.id,
            orgId: org.org_id
          }
        });
      } catch (fnError) {
        console.warn('Edge function not available:', fnError);
      }
      
      return response;
    } catch (error) {
      console.error('Error in createResponse:', error);
      throw error;
    }
  },
  
  async deleteResponse(id: string) {
    try {
      const { error } = await supabase
        .from('responses')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting response:', error);
        throw error;
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error in deleteResponse:', error);
      throw error;
    }
  }
};