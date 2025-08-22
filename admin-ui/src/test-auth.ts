import { supabase } from './lib/supabase';

export async function testAuth() {
  console.log('Testing authentication...');
  
  // Test 1: Get session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('Session error:', sessionError);
    return false;
  }
  
  if (!session) {
    console.log('No session found - user not logged in');
    return false;
  }
  
  console.log('Session found:', {
    userId: session.user.id,
    email: session.user.email,
    tokenExpiry: new Date(session.expires_at! * 1000).toISOString()
  });
  
  // Test 2: Try to fetch memberships
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', session.user.id)
    .single();
  
  if (membershipError) {
    console.error('Membership error:', membershipError);
    return false;
  }
  
  console.log('Membership found:', membership);
  
  // Test 3: Try to fetch from a table using the org_id
  const { data: testData, error: testError } = await supabase
    .from('intents')
    .select('id')
    .eq('org_id', membership.org_id)
    .limit(1);
  
  if (testError) {
    console.error('Test query error:', testError);
    return false;
  }
  
  console.log('Test query successful, found', testData?.length || 0, 'records');
  
  return true;
}

// Add to window for easy testing in browser console
if (typeof window !== 'undefined') {
  (window as any).testAuth = testAuth;
}