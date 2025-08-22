import { FastifyInstance } from 'fastify';
import { database } from '../services/database.js';
import { z } from 'zod';

const uploadCallSchema = z.object({
  audioUrl: z.string().url(),
  externalId: z.string().optional(),
  phoneNumber: z.string().optional(),
  agentId: z.string().uuid().optional()
});

export async function callRoutes(app: FastifyInstance) {
  app.post('/upload', async (request, reply) => {
    const body = uploadCallSchema.parse(request.body);
    
    const result = await database.query(
      `INSERT INTO app.calls (org_id, audio_url, external_id, phone_number, agent_id, status)
       VALUES ($1, $2, $3, $4, $5, 'processing')
       RETURNING id`,
      ['demo_org', body.audioUrl, body.externalId, body.phoneNumber, body.agentId]
    );

    reply.send({ callId: result.rows[0].id });
  });

  app.get('/:callId', async (request: any, reply) => {
    const { callId } = request.params;
    
    const result = await database.query(
      `SELECT c.*, 
              COUNT(DISTINCT t.id) as turn_count,
              COUNT(DISTINCT s.id) as suggestion_count
       FROM app.calls c
       LEFT JOIN app.turns t ON t.call_id = c.id
       LEFT JOIN app.suggestions s ON s.call_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [callId]
    );

    if (result.rows.length === 0) {
      reply.status(404).send({ error: 'Call not found' });
      return;
    }

    reply.send(result.rows[0]);
  });

  app.get('/:callId/turns', async (request: any, reply) => {
    const { callId } = request.params;
    
    const result = await database.query(
      `SELECT * FROM app.turns
       WHERE call_id = $1
       ORDER BY start_ms`,
      [callId]
    );

    reply.send(result.rows);
  });

  app.get('/:callId/suggestions', async (request: any, reply) => {
    const { callId } = request.params;
    
    const result = await database.query(
      `SELECT s.*, i.label as intent_label, r.text as response_text
       FROM app.suggestions s
       LEFT JOIN app.intents i ON i.id = s.intent_id
       LEFT JOIN app.responses r ON r.id = s.response_id
       WHERE s.call_id = $1
       ORDER BY s.created_at`,
      [callId]
    );

    reply.send(result.rows);
  });
}