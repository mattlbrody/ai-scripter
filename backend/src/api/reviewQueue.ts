import { FastifyInstance } from 'fastify';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../services/database.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { logger } from '../utils/logger.js';

export async function reviewQueueRoutes(app: FastifyInstance) {
  const embeddingService = new EmbeddingService();

  app.addHook('preHandler', authenticate);

  app.get('/', {
    preHandler: requireRole('manager')
  }, async (request: AuthenticatedRequest, reply) => {
    try {
      const result = await db.query(
        `SELECT 
          rq.id,
          rq.lead_text,
          rq.proposed_response,
          rq.confidence,
          rq.status,
          rq.created_at,
          c.id as call_id,
          i.label as proposed_intent
        FROM app.review_queue rq
        JOIN app.calls c ON c.id = rq.call_id
        LEFT JOIN app.intents i ON i.id = rq.proposed_intent_id
        WHERE rq.org_id = $1 AND rq.status = 'pending'
        ORDER BY rq.confidence ASC, rq.created_at DESC
        LIMIT 50`,
        [request.user!.orgId]
      );

      return result.rows.map(row => ({
        id: row.id,
        leadText: row.lead_text,
        proposedIntent: row.proposed_intent,
        proposedResponse: row.proposed_response,
        confidence: row.confidence,
        callId: row.call_id,
        timestamp: row.created_at
      }));
    } catch (error) {
      logger.error('Failed to fetch review queue:', error);
      return reply.status(500).send({ error: 'Failed to fetch review queue' });
    }
  });

  app.post('/:id/approve', {
    preHandler: requireRole('manager')
  }, async (request: AuthenticatedRequest, reply) => {
    const { id } = request.params as { id: string };
    const { response } = request.body as { response: string };

    try {
      await db.transaction(async (client) => {
        const queueResult = await client.query(
          `SELECT * FROM app.review_queue 
           WHERE id = $1 AND org_id = $2 AND status = 'pending'`,
          [id, request.user!.orgId]
        );

        if (queueResult.rows.length === 0) {
          throw new Error('Review item not found');
        }

        const item = queueResult.rows[0];

        const responseResult = await client.query(
          `INSERT INTO app.responses (org_id, intent_id, text, source_call_id, source_turn_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            request.user!.orgId,
            item.proposed_intent_id,
            response,
            item.call_id,
            item.turn_id
          ]
        );

        const responseId = responseResult.rows[0].id;

        const embedding = await embeddingService.generateEmbedding(response);
        
        await client.query(
          `INSERT INTO app.embeddings (org_id, response_id, vec, model)
           VALUES ($1, $2, $3, 'text-embedding-3-large')`,
          [request.user!.orgId, responseId, `[${embedding.join(',')}]`]
        );

        await client.query(
          `UPDATE app.review_queue 
           SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
           WHERE id = $2`,
          [request.user!.id, id]
        );
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to approve review item:', error);
      return reply.status(500).send({ error: 'Failed to approve item' });
    }
  });

  app.post('/:id/reject', {
    preHandler: requireRole('manager')
  }, async (request: AuthenticatedRequest, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await db.query(
        `UPDATE app.review_queue 
         SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW()
         WHERE id = $2 AND org_id = $3 AND status = 'pending'
         RETURNING id`,
        [request.user!.id, id, request.user!.orgId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Review item not found' });
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to reject review item:', error);
      return reply.status(500).send({ error: 'Failed to reject item' });
    }
  });
}