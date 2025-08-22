import { FastifyInstance } from 'fastify';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../services/database.js';
import { logger } from '../utils/logger.js';

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request: AuthenticatedRequest, reply) => {
    try {
      const orgId = request.user!.orgId;

      const [
        callsResult,
        suggestionsResult,
        intentsResult,
        successRateResult
      ] = await Promise.all([
        db.query(
          `SELECT COUNT(*) as total FROM app.calls WHERE org_id = $1`,
          [orgId]
        ),
        db.query(
          `SELECT COUNT(*) as total FROM app.suggestions 
           WHERE org_id = $1 AND outcome = 'shown'`,
          [orgId]
        ),
        db.query(
          `SELECT COUNT(*) as total FROM app.intents 
           WHERE org_id = $1 AND is_active = true`,
          [orgId]
        ),
        db.query(
          `SELECT 
            COUNT(CASE WHEN decision = 'suggestion' THEN 1 END)::float / 
            NULLIF(COUNT(*), 0) * 100 as success_rate
           FROM app.suggestions 
           WHERE org_id = $1`,
          [orgId]
        )
      ]);

      return {
        totalCalls: parseInt(callsResult.rows[0].total),
        suggestionsShown: parseInt(suggestionsResult.rows[0].total),
        activeIntents: parseInt(intentsResult.rows[0].total),
        successRate: Math.round(successRateResult.rows[0].success_rate || 0)
      };
    } catch (error) {
      logger.error('Failed to fetch stats:', error);
      return reply.status(500).send({ error: 'Failed to fetch statistics' });
    }
  });
}