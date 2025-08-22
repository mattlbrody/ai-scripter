import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

class Database {
  private pool: pg.Pool | null = null;

  private initialize() {
    if (this.pool) return;
    
    const connectionString = process.env.PG_DSN;
    
    if (!connectionString) {
      logger.error('PG_DSN environment variable is not set');
      throw new Error('Database connection string (PG_DSN) is required');
    }
    
    // Log connection details (hide password)
    const maskedUrl = connectionString.replace(/:([^@]+)@/, ':****@');
    logger.info('Connecting to database:', { url: maskedUrl });
    
    this.pool = new Pool({
      connectionString: connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: { rejectUnauthorized: false }
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected database error:', err);
    });
  }

  async query(text: string, params?: any[]): Promise<pg.QueryResult> {
    this.initialize();
    const start = Date.now();
    try {
      const result = await this.pool!.query(text, params);
      const duration = Date.now() - start;
      
      if (duration > 100) {
        logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}`);
      }
      
      return result;
    } catch (error: any) {
      logger.error('Database query error:', { 
        text: text.substring(0, 200), 
        params, 
        error: error.message,
        code: error.code,
        detail: error.detail 
      });
      throw error;
    }
  }

  async transaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    this.initialize();
    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setOrgContext(orgId: string): Promise<void> {
    await this.query(`SELECT set_config('app.org_id', $1::text, true)`, [orgId]);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1');
      return result.rows.length > 0;
    } catch (error: any) {
      logger.error('Health check failed:', {
        message: error.message,
        code: error.code
      });
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const database = new Database();
export const db = database;