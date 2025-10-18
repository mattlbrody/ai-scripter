import { database } from './database.js';
import { logger } from '../utils/logger.js';
import { testSupabaseConnection } from './supabase-client.js';

export async function initializeServices(): Promise<void> {
  try {
    logger.info('Testing database connection...');
    
    // Try regular database connection first
    let useSupabaseClient = false;
    try {
      const dbHealthy = await database.healthCheck();
      if (dbHealthy) {
        logger.info('Database connected successfully');
        
        const result = await database.query(
          `SELECT EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'vector'
          )`
        );

        if (!result.rows[0].exists) {
          logger.warn('pgvector extension not installed');
        }
      } else {
        throw new Error('Database health check failed');
      }
    } catch (dbError) {
      logger.warn('Direct database connection failed, trying Supabase client...', {
        message: (dbError as any).message
      });
      
      // Fallback to Supabase client
      const supabaseHealthy = await testSupabaseConnection();
      if (!supabaseHealthy) {
        throw new Error('Both database and Supabase connections failed');
      }
      
      useSupabaseClient = true;
      logger.info('Using Supabase client for database operations');
    }

    logger.info('All services initialized successfully', { useSupabaseClient });
  } catch (error: any) {
    logger.error('Failed to initialize services:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
    throw error;
  }
}

export { database } from './database.js';
export { IntentClassifier } from './intentClassifier.js';
export { ResponseMatcher } from './responseMatcher.js';
export { TurnDetector } from './turnDetector.js';