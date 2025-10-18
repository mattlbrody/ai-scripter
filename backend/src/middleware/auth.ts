import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db } from '../services/database.js';
import { logger } from '../utils/logger.js';

let supabase: SupabaseClient | null = null;

function getSupabaseClient() {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase environment variables not set');
    }
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return supabase;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    orgId: string;
    role: 'admin' | 'manager' | 'agent';
  };
}

export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization header' });
    }

    const token = authHeader.substring(7);
    
    const { data: { user }, error } = await getSupabaseClient().auth.getUser(token);
    
    if (error || !user) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const membershipResult = await db.query(
      `SELECT m.org_id, m.role 
       FROM app.memberships m
       WHERE m.user_id = $1 AND m.is_active = true
       LIMIT 1`,
      [user.id]
    );

    if (membershipResult.rows.length === 0) {
      return reply.status(403).send({ error: 'No active membership found' });
    }

    const membership = membershipResult.rows[0];
    
    await db.setOrgContext(membership.org_id);

    request.user = {
      id: user.id,
      email: user.email!,
      orgId: membership.org_id,
      role: membership.role
    };
  } catch (error) {
    logger.error('Authentication error:', error);
    return reply.status(500).send({ error: 'Authentication failed' });
  }
}

export function requireRole(requiredRole: 'admin' | 'manager' | 'agent') {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const roleHierarchy = {
      admin: 3,
      manager: 2,
      agent: 1
    };

    if (roleHierarchy[request.user.role] < roleHierarchy[requiredRole]) {
      return reply.status(403).send({ 
        error: `Insufficient permissions. Required role: ${requiredRole}` 
      });
    }
  };
}