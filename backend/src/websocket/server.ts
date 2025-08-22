import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { AudioStreamHandler } from './audioStreamHandler.js';
import { SessionManager } from './sessionManager.js';
import { logger } from '../utils/logger.js';

export class WebSocketServer {
  private app: FastifyInstance;
  private sessionManager: SessionManager;

  constructor(app: FastifyInstance) {
    this.app = app;
    this.sessionManager = new SessionManager();
  }

  async initialize() {
    this.app.register(async (fastify) => {
      fastify.get('/ws', { websocket: true }, (connection, req) => {
        this.handleConnection(connection, req);
      });
    });
  }

  private handleConnection(connection: any, req: any) {
    const socket = connection.socket as WebSocket;
    const sessionId = this.generateSessionId();
    
    logger.info(`WebSocket connection established: ${sessionId}`);

    const session = this.sessionManager.createSession(sessionId, socket);
    const audioHandler = new AudioStreamHandler(session);

    socket.on('message', async (data: Buffer | string) => {
      try {
        if (Buffer.isBuffer(data)) {
          await audioHandler.processAudioChunk(data);
        } else {
          const message = JSON.parse(data.toString());
          await this.handleMessage(session, message);
        }
      } catch (error) {
        logger.error('Error processing WebSocket message:', error);
        this.sendError(socket, 'Failed to process message');
      }
    });

    socket.on('close', () => {
      logger.info(`WebSocket connection closed: ${sessionId}`);
      audioHandler.cleanup();
      this.sessionManager.removeSession(sessionId);
    });

    socket.on('error', (error) => {
      logger.error(`WebSocket error for session ${sessionId}:`, error);
      audioHandler.cleanup();
      this.sessionManager.removeSession(sessionId);
    });

    this.sendMessage(socket, {
      type: 'CONNECTION_ESTABLISHED',
      sessionId,
      timestamp: Date.now()
    });
  }

  private async handleMessage(session: any, message: any) {
    logger.debug('Received message:', message.type);

    switch (message.type) {
      case 'CALL_START':
        await session.startCall(message.callId);
        break;

      case 'CALL_END':
        await session.endCall();
        break;

      case 'PING':
        this.sendMessage(session.socket, {
          type: 'PONG',
          timestamp: Date.now()
        });
        break;

      default:
        logger.warn('Unknown message type:', message.type);
    }
  }

  private sendMessage(socket: WebSocket, data: any) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  private sendError(socket: WebSocket, error: string) {
    this.sendMessage(socket, {
      type: 'ERROR',
      error,
      timestamp: Date.now()
    });
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}