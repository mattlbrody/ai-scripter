import { database } from './database.js';
import { logger } from '../utils/logger.js';

interface Intent {
  id: string;
  label: string;
  threshold: number;
  confidence: number;
}

export class IntentClassifier {
  private intentsCache: Map<string, any> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate = 0;

  async classify(text: string): Promise<Intent | null> {
    try {
      await this.refreshIntentsCache();

      const normalized = text.toLowerCase();
      
      const scores = await this.calculateIntentScores(normalized);
      
      if (scores.length === 0) {
        return null;
      }

      const bestMatch = scores[0];
      
      if (bestMatch.score < 0.5) {
        return null;
      }

      const intent = this.intentsCache.get(bestMatch.intentId);
      
      return {
        id: bestMatch.intentId,
        label: intent.label,
        threshold: intent.threshold,
        confidence: bestMatch.score
      };
    } catch (error) {
      logger.error('Intent classification error:', error);
      return null;
    }
  }

  private async calculateIntentScores(text: string): Promise<Array<{intentId: string, score: number}>> {
    const scores: Array<{intentId: string, score: number}> = [];

    const patterns = {
      'objection': [
        /\b(not sure|don't think|skeptical|doubt|concern|worried|hesitant)\b/i,
        /\b(too expensive|too much|can't afford|budget)\b/i,
        /\b(don't need|not interested|no thanks|not right now)\b/i
      ],
      'pricing_question': [
        /\b(how much|what.*cost|price|pricing|fee|charge|pay)\b/i,
        /\b(afford|budget|expensive|cheap|discount|deal)\b/i
      ],
      'competitor_mention': [
        /\b(competitor|alternative|other option|instead|compare|versus|vs)\b/i,
        /\b(already using|currently have|existing|switched from)\b/i
      ],
      'interest_signal': [
        /\b(tell me more|interested|sounds good|like to know|how does.*work)\b/i,
        /\b(can you.*|would it.*|does it.*|is it possible)\b/i,
        /\b(features|benefits|capabilities|what can)\b/i
      ],
      'scheduling': [
        /\b(schedule|calendar|meeting|call|appointment|available)\b/i,
        /\b(tomorrow|next week|monday|tuesday|wednesday|thursday|friday)\b/i,
        /\b(morning|afternoon|evening|time|when can)\b/i
      ]
    };

    for (const [intentLabel, intentPatterns] of Object.entries(patterns)) {
      let score = 0;
      let matches = 0;

      for (const pattern of intentPatterns) {
        if (pattern.test(text)) {
          matches++;
          score += 1.0 / intentPatterns.length;
        }
      }

      if (matches > 0) {
        const intent = Array.from(this.intentsCache.values()).find(i => i.label === intentLabel);
        if (intent) {
          scores.push({ intentId: intent.id, score: Math.min(score * 1.2, 1.0) });
        }
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores;
  }

  private async refreshIntentsCache(): Promise<void> {
    if (Date.now() - this.lastCacheUpdate < this.cacheExpiry) {
      return;
    }

    try {
      const intents = await database.query(
        `SELECT id, label, threshold, priority 
         FROM app.intents 
         WHERE is_active = true 
         ORDER BY priority DESC`
      );

      this.intentsCache.clear();
      for (const intent of intents.rows) {
        this.intentsCache.set(intent.id, intent);
      }

      this.lastCacheUpdate = Date.now();
    } catch (error) {
      logger.error('Failed to refresh intents cache:', error);
    }
  }
}