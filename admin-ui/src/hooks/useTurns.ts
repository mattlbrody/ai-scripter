import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

async function getCurrentOrg() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  
  const { data: membership, error } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .single();
    
  if (error || !membership) throw new Error('No organization membership found');
  return membership.org_id;
}

export function useTurns(callId: string) {
  return useQuery({
    queryKey: ['turns', callId],
    queryFn: async () => {
      const orgId = await getCurrentOrg();
      
      const { data, error } = await supabase
        .from('turns')
        .select('*')
        .eq('call_id', callId)
        .eq('org_id', orgId)
        .order('start_ms', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!callId,
  });
}