import { createClient } from '@deepgram/sdk';
import { EmbeddingService } from './embeddingService.js';
import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { IntentClassifier } from './intentClassifier.js';
import { TurnDetector } from './turnDetector.js';

interface ProcessedTurn {
  speaker: 'agent' | 'lead';
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

interface ClusteredIntent {
  label: string;
  turns: ProcessedTurn[];
  centroid?: number[];
}

export class CallProcessor {
  private deepgram: any;
  private embeddingService: EmbeddingService;
  private intentClassifier: IntentClassifier;
  private turnDetector: TurnDetector;

  constructor() {
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
    this.embeddingService = new EmbeddingService();
    this.intentClassifier = new IntentClassifier();
    this.turnDetector = new TurnDetector();
  }

  async processUploadedCall(
    audioBuffer: Buffer,
    orgId: string,
    agentId?: string,
    metadata?: any
  ): Promise<string> {
    const callId = await this.createCallRecord(orgId, agentId, metadata);
    
    try {
      const transcript = await this.transcribeAudio(audioBuffer);
      const turns = this.segmentTurns(transcript);
      const leadTurns = turns.filter(t => t.speaker === 'lead');
      
      await this.saveTurns(callId, orgId, turns);
      
      const candidates = await this.generateResponseCandidates(leadTurns, orgId);
      await this.addToReviewQueue(callId, orgId, candidates);
      
      await this.updateCallStatus(callId, 'ready');
      
      logger.info(`Call ${callId} processed successfully`);
      return callId;
    } catch (error) {
      logger.error(`Failed to process call ${callId}:`, error);
      await this.updateCallStatus(callId, 'failed');
      throw error;
    }
  }

  private async createCallRecord(
    orgId: string,
    agentId?: string,
    metadata?: any
  ): Promise<string> {
    const result = await db.query(
      `INSERT INTO app.calls (org_id, agent_id, status, metadata, started_at)
       VALUES ($1, $2, 'processing', $3, NOW())
       RETURNING id`,
      [orgId, agentId, metadata || {}]
    );
    return result.rows[0].id;
  }

  private async transcribeAudio(audioBuffer: Buffer): Promise<any> {
    const response = await this.deepgram.transcription.preRecorded(
      { buffer: audioBuffer, mimetype: 'audio/wav' },
      {
        model: 'nova-2',
        smart_format: true,
        diarize: true,
        punctuate: true,
        utterances: true,
        language: 'en-US'
      }
    );

    return response.results;
  }

  private segmentTurns(transcript: any): ProcessedTurn[] {
    const turns: ProcessedTurn[] = [];
    const utterances = transcript.channels[0].alternatives[0].utterances || [];
    
    for (const utterance of utterances) {
      const speaker = utterance.speaker === 0 ? 'agent' : 'lead';
      turns.push({
        speaker,
        text: utterance.transcript,
        startMs: Math.round(utterance.start * 1000),
        endMs: Math.round(utterance.end * 1000),
        confidence: utterance.confidence
      });
    }

    return this.mergeContinuousTurns(turns);
  }

  private mergeContinuousTurns(turns: ProcessedTurn[]): ProcessedTurn[] {
    const merged: ProcessedTurn[] = [];
    let current: ProcessedTurn | null = null;

    for (const turn of turns) {
      if (!current || current.speaker !== turn.speaker || 
          turn.startMs - current.endMs > 300) {
        if (current) merged.push(current);
        current = { ...turn };
      } else {
        current.text += ' ' + turn.text;
        current.endMs = turn.endMs;
        current.confidence = Math.min(current.confidence, turn.confidence);
      }
    }

    if (current) merged.push(current);
    return merged;
  }

  private async saveTurns(callId: string, orgId: string, turns: ProcessedTurn[]) {
    for (const turn of turns) {
      await db.query(
        `INSERT INTO app.turns (call_id, org_id, speaker, text, start_ms, end_ms, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [callId, orgId, turn.speaker, turn.text, turn.startMs, turn.endMs, turn.confidence]
      );
    }
  }

  private async generateResponseCandidates(
    leadTurns: ProcessedTurn[],
    orgId: string
  ): Promise<any[]> {
    const candidates = [];

    for (const turn of leadTurns) {
      if (turn.text.split(/\s+/).length < 6) continue;

      const queryText = this.turnDetector.extractQuery(turn.text);
      const intent = await this.intentClassifier.classify(queryText);
      
      if (!intent || intent.confidence < 0.6) continue;

      const embedding = await this.embeddingService.generateEmbedding(queryText);
      
      const similarResponses = await this.findSimilarResponses(
        embedding,
        intent.id,
        orgId
      );

      const bestMatch = similarResponses[0];
      
      candidates.push({
        turnText: turn.text,
        queryText,
        intentId: intent.id,
        intentLabel: intent.label,
        confidence: intent.confidence,
        proposedResponse: bestMatch?.text || this.generateDefaultResponse(intent.label),
        similarity: bestMatch?.similarity || 0,
        embedding
      });
    }

    return this.deduplicateCandidates(candidates);
  }

  private async findSimilarResponses(
    embedding: number[],
    intentId: string,
    orgId: string
  ): Promise<any[]> {
    const result = await db.query(
      `SELECT r.id, r.text, (1 - (e.vec <=> $1::vector)) as similarity
       FROM app.embeddings e
       JOIN app.responses r ON r.id = e.response_id
       WHERE r.org_id = $2 AND r.intent_id = $3
       ORDER BY e.vec <=> $1::vector
       LIMIT 5`,
      [`[${embedding.join(',')}]`, orgId, intentId]
    );

    return result.rows;
  }

  private generateDefaultResponse(intentLabel: string): string {
    const defaults: Record<string, string> = {
      'objection': "I understand your concern. Let me address that for you.",
      'pricing_question': "Our pricing is designed to provide excellent value. Let me break it down for you.",
      'competitor_mention': "That's a great question. Here's how we differentiate ourselves.",
      'interest_signal': "I'm glad you're interested! Let me tell you more about that.",
      'scheduling': "I'd be happy to schedule a time that works for you."
    };

    return defaults[intentLabel] || "Let me help you with that.";
  }

  private deduplicateCandidates(candidates: any[]): any[] {
    const unique: any[] = [];
    
    for (const candidate of candidates) {
      const isDuplicate = unique.some(u => 
        this.embeddingService.calculateCosineSimilarity(
          u.embedding,
          candidate.embedding
        ) >= 0.95
      );
      
      if (!isDuplicate) {
        unique.push(candidate);
      }
    }

    return unique;
  }

  private async addToReviewQueue(callId: string, orgId: string, candidates: any[]) {
    for (const candidate of candidates) {
      const turnResult = await db.query(
        `SELECT id FROM app.turns 
         WHERE call_id = $1 AND text = $2 
         LIMIT 1`,
        [callId, candidate.turnText]
      );

      const turnId = turnResult.rows[0]?.id;
      if (!turnId) continue;

      await db.query(
        `INSERT INTO app.review_queue 
         (org_id, call_id, turn_id, lead_text, proposed_intent_id, proposed_response, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          orgId,
          callId,
          turnId,
          candidate.turnText,
          candidate.intentId,
          candidate.proposedResponse,
          candidate.confidence
        ]
      );
    }
  }

  private async updateCallStatus(callId: string, status: string) {
    await db.query(
      `UPDATE app.calls 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2`,
      [status, callId]
    );
  }

  async clusterIntents(turns: ProcessedTurn[]): Promise<ClusteredIntent[]> {
    const leadTurns = turns.filter(t => t.speaker === 'lead');
    const embeddings = await this.embeddingService.generateBatchEmbeddings(
      leadTurns.map(t => this.turnDetector.extractQuery(t.text))
    );

    const clusters = this.performKMeansClustering(leadTurns, embeddings, 5);
    
    return clusters.map(cluster => ({
      label: this.generateIntentLabel(cluster.turns),
      turns: cluster.turns,
      centroid: cluster.centroid
    }));
  }

  private performKMeansClustering(
    turns: ProcessedTurn[],
    embeddings: number[][],
    k: number
  ): any[] {
    return [];
  }

  private generateIntentLabel(turns: ProcessedTurn[]): string {
    const keywords = this.extractKeywords(turns.map(t => t.text).join(' '));
    return keywords.slice(0, 3).join('_');
  }

  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an']);
    return words.filter(w => !stopWords.has(w) && w.length > 3);
  }
}