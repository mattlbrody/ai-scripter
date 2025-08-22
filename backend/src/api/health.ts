import { FastifyInstance } from 'fastify';
import { database } from '../services/database.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const dbHealthy = await database.healthCheck();
    
    const status = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'connected' : 'disconnected'
      }
    };

    reply.status(dbHealthy ? 200 : 503).send(status);
  });

  app.get('/ready', async (request, reply) => {
    const dbHealthy = await database.healthCheck();
    
    if (!dbHealthy) {
      reply.status(503).send({ ready: false });
      return;
    }

    reply.send({ ready: true });
  });
}