import { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';

export interface Session {
  id: string;
  socket: WebSocket;
  orgId: string;
  userId?: string;
  callId?: string;
  startedAt: Date;
  lastActivity: Date;
  metadata: Record<string, any>;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 60000);
  }

  createSession(id: string, socket: WebSocket): Session {
    const session: Session = {
      id,
      socket,
      orgId: 'demo_org', // TODO: Get from auth
      startedAt: new Date(),
      lastActivity: new Date(),
      metadata: {}
    };

    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  removeSession(id: string): void {
    this.sessions.delete(id);
  }

  async startCall(sessionId: string, callId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (session) {
      session.callId = callId;
      logger.info(`Call started for session ${sessionId}: ${callId}`);
    }
  }

  async endCall(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (session && session.callId) {
      logger.info(`Call ended for session ${sessionId}: ${session.callId}`);
      session.callId = undefined;
    }
  }

  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > timeout) {
        logger.info(`Cleaning up inactive session: ${id}`);
        if (session.socket.readyState === WebSocket.OPEN) {
          session.socket.close();
        }
        this.sessions.delete(id);
      }
    }
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    for (const session of this.sessions.values()) {
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.close();
      }
    }
    this.sessions.clear();
  }
}