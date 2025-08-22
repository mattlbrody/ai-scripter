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
    
    return membership;
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
  
  async uploadCall(file: File) {
    try {
      const org = await getCurrentOrg();
      
      // Upload to Supabase Storage
      const fileName = `${Date.now()}-${file.name}`;
      const { data: upload, error: uploadError } = await supabase.storage
        .from('calls')
        .upload(fileName, file);
      
      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error('Failed to upload file');
      }
      
      // Create call record
      const { data: call, error: callError } = await supabase
        .from('calls')
        .insert({
          org_id: org.org_id,
          audio_url: upload?.path,
          status: 'processing'
        })
        .select()
        .single();
      
      if (callError) {
        console.error('Error creating call record:', callError);
        throw new Error('Failed to create call record');
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