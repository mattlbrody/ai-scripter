import { FastifyInstance } from 'fastify';
import { database } from '../services/database.js';
import { z } from 'zod';

const reviewItemSchema = z.object({
  status: z.enum(['approved', 'rejected', 'edited']),
  proposedResponse: z.string().optional(),
  notes: z.string().optional()
});

export async function adminRoutes(app: FastifyInstance) {
  app.get('/review-queue', async (request, reply) => {
    const result = await database.query(
      `SELECT rq.*, t.text as turn_text, c.external_id as call_id, i.label as intent_label
       FROM app.review_queue rq
       JOIN app.turns t ON t.id = rq.turn_id
       JOIN app.calls c ON c.id = rq.call_id
       LEFT JOIN app.intents i ON i.id = rq.proposed_intent_id
       WHERE rq.status = 'pending'
       ORDER BY rq.confidence ASC, rq.created_at DESC
       LIMIT 50`
    );

    reply.send(result.rows);
  });

  app.patch('/review-queue/:itemId', async (request: any, reply) => {
    const { itemId } = request.params;
    const body = reviewItemSchema.parse(request.body);
    
    await database.query(
      `UPDATE app.review_queue
       SET status = $1, 
           proposed_response = COALESCE($2, proposed_response),
           notes = $3,
           reviewed_at = NOW()
       WHERE id = $4`,
      [body.status, body.proposedResponse, body.notes, itemId]
    );

    reply.send({ success: true });
  });

  app.get('/analytics/suggestions', async (request, reply) => {
    const result = await database.query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE decision = 'suggestion') as suggestions,
         COUNT(*) FILTER (WHERE decision = 'no_match') as no_matches,
         COUNT(*) FILTER (WHERE outcome = 'shown') as shown,
         COUNT(*) FILTER (WHERE outcome = 'ignored') as ignored,
         AVG(similarity_score) FILTER (WHERE decision = 'suggestion') as avg_similarity,
         AVG(latency_ms) as avg_latency
       FROM app.suggestions
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );

    reply.send(result.rows);
  });

  app.get('/analytics/intents', async (request, reply) => {
    const result = await database.query(
      `SELECT 
         i.label,
         i.threshold,
         COUNT(DISTINCT s.id) as suggestion_count,
         COUNT(DISTINCT s.id) FILTER (WHERE s.outcome = 'shown') as shown_count,
         COUNT(DISTINCT s.id) FILTER (WHERE s.outcome = 'ignored') as ignored_count,
         AVG(s.similarity_score) as avg_similarity
       FROM app.intents i
       LEFT JOIN app.suggestions s ON s.intent_id = i.id
       WHERE i.is_active = true
       GROUP BY i.id
       ORDER BY suggestion_count DESC`
    );

    reply.send(result.rows);
  });
}