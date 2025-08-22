import { database } from './database.js';
import { logger } from '../utils/logger.js';

export async function initializeServices(): Promise<void> {
  try {
    logger.info('Testing database connection...');
    const dbHealthy = await database.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connected successfully');

    const result = await database.query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      )`
    );

    if (!result.rows[0].exists) {
      logger.warn('pgvector extension not installed');
    }

    logger.info('All services initialized successfully');
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