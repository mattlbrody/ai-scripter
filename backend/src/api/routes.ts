import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { callRoutes } from './calls.js';
import { responseRoutes } from './responses.js';
import { adminRoutes } from './admin.js';
import { reviewQueueRoutes } from './reviewQueue.js';
import { intentsRoutes } from './intents.js';
import { statsRoutes } from './stats.js';

export async function apiRoutes(app: FastifyInstance) {
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(callRoutes, { prefix: '/calls' });
  await app.register(responseRoutes, { prefix: '/responses' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(reviewQueueRoutes, { prefix: '/review-queue' });
  await app.register(intentsRoutes, { prefix: '/intents' });
  await app.register(statsRoutes, { prefix: '/stats' });
}