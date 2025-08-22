import { FastifyInstance } from 'fastify';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../services/database.js';
import { logger } from '../utils/logger.js';

export async function intentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request: AuthenticatedRequest, reply) => {
    try {
      const result = await db.query(
        `SELECT id, label, description, threshold, is_active, created_at
         FROM app.intents
         WHERE org_id = $1
         ORDER BY label`,
        [request.user!.orgId]
      );

      return result.rows.map(row => ({
        id: row.id,
        label: row.label,
        description: row.description,
        threshold: parseFloat(row.threshold),
        isActive: row.is_active,
        createdAt: row.created_at
      }));
    } catch (error) {
      logger.error('Failed to fetch intents:', error);
      return reply.status(500).send({ error: 'Failed to fetch intents' });
    }
  });

  app.post('/', {
    preHandler: requireRole('manager')
  }, async (request: AuthenticatedRequest, reply) => {
    const { label, description, threshold } = request.body as {
      label: string;
      description: string;
      threshold: number;
    };

    try {
      const result = await db.query(
        `INSERT INTO app.intents (org_id, label, description, threshold)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [request.user!.orgId, label, description, threshold]
      );

      return { id: result.rows[0].id, success: true };
    } catch (error) {
      logger.error('Failed to create intent:', error);
      if ((error as any).code === '23505') {
        return reply.status(409).send({ error: 'Intent with this label already exists' });
      }
      return reply.status(500).send({ error: 'Failed to create intent' });
    }
  });

  app.patch('/:id', {
    preHandler: requireRole('manager')
  }, async (request: AuthenticatedRequest, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      label: string;
      threshold: number;
      isActive: boolean;
    }>;

    try {
      const setClauses = [];
      const values = [];
      let paramCount = 1;

      if (updates.label !== undefined) {
        setClauses.push(`label = $${paramCount++}`);
        values.push(updates.label);
      }
      if (updates.threshold !== undefined) {
        setClauses.push(`threshold = $${paramCount++}`);
        values.push(updates.threshold);
      }
      if (updates.isActive !== undefined) {
        setClauses.push(`is_active = $${paramCount++}`);
        values.push(updates.isActive);
      }

      if (setClauses.length === 0) {
        return reply.status(400).send({ error: 'No updates provided' });
      }

      values.push(id);
      values.push(request.user!.orgId);

      const result = await db.query(
        `UPDATE app.intents 
         SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE id = $${paramCount} AND org_id = $${paramCount + 1}
         RETURNING id`,
        values
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Intent not found' });
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to update intent:', error);
      return reply.status(500).send({ error: 'Failed to update intent' });
    }
  });
}