import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

let supabaseClient: any = null;

export function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables not set');
    }
    
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false
      }
    });
    
    logger.info('Supabase client initialized');
  }
  
  return supabaseClient;
}

export async function testSupabaseConnection() {
  try {
    const client = getSupabaseClient();
    
    // Test with auth.users which should be accessible with service key
    const { data, error } = await client.auth.admin.listUsers({
      page: 1,
      perPage: 1
    });
    
    if (error) {
      logger.error('Supabase connection test failed:', error);
      return false;
    }
    
    logger.info('Supabase connection test successful');
    return true;
  } catch (error) {
    logger.error('Supabase connection test error:', error);
    return false;
  }
}