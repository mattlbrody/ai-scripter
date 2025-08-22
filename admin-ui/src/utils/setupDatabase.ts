import { supabase } from '../lib/supabase';

/**
 * This utility helps set up the database for a new user
 * It creates an organization and membership if they don't exist
 */
export async function setupUserDatabase() {
  try {
    // Get the current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      console.error('No authenticated user found');
      return { success: false, error: 'Not authenticated' };
    }
    
    const userId = session.user.id;
    const userEmail = session.user.email;
    
    console.log('Setting up database for user:', userEmail);
    
    // Check if user already has a membership
    const { data: existingMembership, error: membershipCheckError } = await supabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', userId)
      .single();
    
    if (existingMembership) {
      console.log('User already has membership:', existingMembership);
      return { success: true, membership: existingMembership };
    }
    
    // If no membership exists, create an organization and membership
    // First, check if there's a default organization
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name')
      .limit(1);
    
    let orgId;
    
    if (orgs && orgs.length > 0) {
      // Use existing org
      orgId = orgs[0].id;
      console.log('Using existing organization:', orgs[0].name);
    } else {
      // Create a new organization
      const { data: newOrg, error: createOrgError } = await supabase
        .from('organizations')
        .insert({
          name: `${userEmail}'s Organization`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (createOrgError) {
        console.error('Error creating organization:', createOrgError);
        return { success: false, error: 'Failed to create organization' };
      }
      
      orgId = newOrg.id;
      console.log('Created new organization:', newOrg.name);
    }
    
    // Create membership
    const { data: newMembership, error: createMembershipError } = await supabase
      .from('memberships')
      .insert({
        user_id: userId,
        org_id: orgId,
        role: 'admin',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (createMembershipError) {
      console.error('Error creating membership:', createMembershipError);
      
      // If it's a permission error, provide helpful message
      if (createMembershipError.code === '42501') {
        return { 
          success: false, 
          error: 'Database permissions not configured. Please run the fix-rls-policies.sql script in Supabase SQL editor.' 
        };
      }
      
      return { success: false, error: 'Failed to create membership' };
    }
    
    console.log('Created membership successfully:', newMembership);
    
    // Create some default intents to get started
    const defaultIntents = [
      { label: 'Schedule Meeting', description: 'Customer wants to schedule a meeting', threshold: 0.75 },
      { label: 'Product Question', description: 'Customer has questions about the product', threshold: 0.70 },
      { label: 'Pricing Inquiry', description: 'Customer asking about pricing', threshold: 0.75 },
      { label: 'Not Interested', description: 'Customer is not interested', threshold: 0.80 }
    ];
    
    for (const intent of defaultIntents) {
      await supabase
        .from('intents')
        .insert({
          org_id: orgId,
          ...intent,
          is_active: true,
          created_at: new Date().toISOString()
        });
    }
    
    console.log('Created default intents');
    
    return { success: true, membership: newMembership };
    
  } catch (error) {
    console.error('Error in setupUserDatabase:', error);
    return { success: false, error: String(error) };
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).setupUserDatabase = setupUserDatabase;
}