import { FastifyInstance } from 'fastify';
import { database } from '../services/database.js';
import { z } from 'zod';
import { OpenAI } from 'openai';

const createResponseSchema = z.object({
  intentId: z.string().uuid(),
  text: z.string().min(1),
  sourceCallId: z.string().uuid().optional(),
  sourceTurnId: z.string().uuid().optional()
});

export async function responseRoutes(app: FastifyInstance) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  app.post('/', async (request, reply) => {
    const body = createResponseSchema.parse(request.body);
    
    await database.transaction(async (client) => {
      const responseResult = await client.query(
        `INSERT INTO app.responses (org_id, intent_id, text, source_call_id, source_turn_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['demo_org', body.intentId, body.text, body.sourceCallId, body.sourceTurnId]
      );

      const responseId = responseResult.rows[0].id;

      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: body.text,
        dimensions: 3072
      });

      const embedding = `[${embeddingResponse.data[0].embedding.join(',')}]`;

      await client.query(
        `INSERT INTO app.embeddings (org_id, response_id, vec)
         VALUES ($1, $2, $3::vector)`,
        ['demo_org', responseId, embedding]
      );

      reply.send({ responseId });
    });
  });

  app.get('/intents', async (request, reply) => {
    const result = await database.query(
      `SELECT i.*, COUNT(r.id) as response_count
       FROM app.intents i
       LEFT JOIN app.responses r ON r.intent_id = i.id
       WHERE i.is_active = true
       GROUP BY i.id
       ORDER BY i.priority DESC, i.label`
    );

    reply.send(result.rows);
  });

  app.get('/intent/:intentId', async (request: any, reply) => {
    const { intentId } = request.params;
    
    const result = await database.query(
      `SELECT r.*, 
              COALESCE(AVG(s.similarity_score), 0) as avg_similarity,
              COUNT(DISTINCT s.id) as usage_count
       FROM app.responses r
       LEFT JOIN app.suggestions s ON s.response_id = r.id
       WHERE r.intent_id = $1
       GROUP BY r.id
       ORDER BY r.rating DESC`,
      [intentId]
    );

    reply.send(result.rows);
  });
}