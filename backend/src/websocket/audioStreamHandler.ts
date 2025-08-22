import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { TurnDetector } from '../services/turnDetector.js';
import { IntentClassifier } from '../services/intentClassifier.js';
import { ResponseMatcher } from '../services/responseMatcher.js';
import { logger } from '../utils/logger.js';
import { WebSocket } from 'ws';

export class AudioStreamHandler {
  private session: any;
  private deepgram: any;
  private connection: any;
  private turnDetector: TurnDetector;
  private intentClassifier: IntentClassifier;
  private responseMatcher: ResponseMatcher;
  private audioBuffer: Buffer[] = [];
  private transcriptBuffer: string = '';
  private lastSpeaker: 'agent' | 'lead' | null = null;
  private turnStartTime: number | null = null;

  constructor(session: any) {
    this.session = session;
    this.turnDetector = new TurnDetector();
    this.intentClassifier = new IntentClassifier();
    this.responseMatcher = new ResponseMatcher();
    this.initializeDeepgram();
  }

  private initializeDeepgram() {
    try {
      this.deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
      
      this.connection = this.deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        diarize: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: parseInt(process.env.TURN_SILENCE_MS || '200'),
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000
      });

      this.setupDeepgramHandlers();
    } catch (error) {
      logger.error('Failed to initialize Deepgram:', error);
      throw error;
    }
  }

  private setupDeepgramHandlers() {
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      logger.debug('Deepgram connection opened');
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, async (data: any) => {
      await this.handleTranscript(data);
    });

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, async () => {
      await this.handleUtteranceEnd();
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      logger.error('Deepgram error:', error);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      logger.debug('Deepgram connection closed');
    });
  }

  async processAudioChunk(chunk: Buffer) {
    this.audioBuffer.push(chunk);
    
    if (this.connection && this.connection.getReadyState() === 1) {
      this.connection.send(chunk);
    }
  }

  private async handleTranscript(data: any) {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    
    if (!transcript || transcript.trim().length === 0) {
      return;
    }

    const speaker = this.detectSpeaker(data);
    const isFinal = data.is_final;

    if (speaker !== this.lastSpeaker && this.transcriptBuffer.length > 0) {
      await this.processTurn(this.lastSpeaker!, this.transcriptBuffer);
      this.transcriptBuffer = '';
      this.turnStartTime = Date.now();
    }

    this.lastSpeaker = speaker;
    
    if (isFinal) {
      this.transcriptBuffer += transcript + ' ';
    }

    if (speaker === 'lead' && isFinal) {
      await this.processPartialLeadTurn(this.transcriptBuffer);
    }
  }

  private detectSpeaker(data: any): 'agent' | 'lead' {
    const words = data.channel?.alternatives?.[0]?.words || [];
    
    if (words.length === 0) {
      return this.lastSpeaker || 'lead';
    }

    const speakerVotes = words.reduce((acc: any, word: any) => {
      const speaker = word.speaker || 0;
      acc[speaker] = (acc[speaker] || 0) + 1;
      return acc;
    }, {});

    const dominantSpeaker = Object.keys(speakerVotes).reduce((a, b) => 
      speakerVotes[a] > speakerVotes[b] ? a : b
    );

    return dominantSpeaker === '0' ? 'agent' : 'lead';
  }

  private async handleUtteranceEnd() {
    if (this.transcriptBuffer.length > 0 && this.lastSpeaker) {
      await this.processTurn(this.lastSpeaker, this.transcriptBuffer);
      this.transcriptBuffer = '';
      this.turnStartTime = null;
    }
  }

  private async processTurn(speaker: 'agent' | 'lead', text: string) {
    const processingStart = Date.now();
    
    logger.debug(`Processing ${speaker} turn: "${text.substring(0, 50)}..."`);

    if (speaker === 'agent') {
      this.dismissActiveSuggestions();
      return;
    }

    const tokens = text.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length < parseInt(process.env.MIN_TOKENS || '6')) {
      return;
    }

    try {
      const queryText = this.turnDetector.extractQuery(text);
      
      const intent = await this.intentClassifier.classify(queryText);
      
      if (!intent) {
        this.sendNoMatch(text, 'No intent detected');
        return;
      }

      const response = await this.responseMatcher.findBestMatch(
        queryText,
        intent.id,
        this.session.orgId
      );

      const processingTime = Date.now() - processingStart;

      if (response && response.similarity >= intent.threshold) {
        this.sendSuggestion({
          leadText: text,
          intent: {
            label: intent.label,
            score: intent.confidence
          },
          response: {
            text: response.text,
            sourceId: response.id
          },
          similarity: response.similarity,
          latencyMs: processingTime
        });
      } else {
        this.sendNoMatch(text, `Below threshold (${response?.similarity?.toFixed(2) || 0} < ${intent.threshold})`);
      }
    } catch (error) {
      logger.error('Error processing turn:', error);
      this.sendNoMatch(text, 'Processing error');
    }
  }

  private async processPartialLeadTurn(text: string) {
    const tokens = text.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length < 20) {
      return;
    }

    const queryText = this.turnDetector.extractQuery(text, 64);
    const intent = await this.intentClassifier.classify(queryText);
    
    if (!intent || intent.confidence < 0.88) {
      return;
    }

    const response = await this.responseMatcher.findBestMatch(
      queryText,
      intent.id,
      this.session.orgId
    );

    if (response && response.similarity >= 0.88) {
      this.sendSuggestion({
        leadText: text,
        intent: {
          label: intent.label,
          score: intent.confidence
        },
        response: {
          text: response.text,
          sourceId: response.id
        },
        similarity: response.similarity,
        earlyShow: true,
        latencyMs: Date.now() - (this.turnStartTime || Date.now())
      });
    }
  }

  private sendSuggestion(data: any) {
    this.sendToClient({
      type: 'SUGGESTION',
      data: {
        ...data,
        callId: this.session.callId,
        timestamp: Date.now(),
        decision: 'suggestion'
      }
    });
  }

  private sendNoMatch(leadText: string, reason: string) {
    this.sendToClient({
      type: 'SUGGESTION',
      data: {
        leadText,
        decision: 'no_match',
        reason,
        callId: this.session.callId,
        timestamp: Date.now()
      }
    });
  }

  private dismissActiveSuggestions() {
    this.sendToClient({
      type: 'DISMISS_SUGGESTIONS',
      timestamp: Date.now()
    });
  }

  private sendToClient(data: any) {
    if (this.session.socket.readyState === WebSocket.OPEN) {
      this.session.socket.send(JSON.stringify(data));
    }
  }

  cleanup() {
    if (this.connection) {
      this.connection.close();
    }
    this.audioBuffer = [];
    this.transcriptBuffer = '';
  }
}