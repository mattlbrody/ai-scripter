import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';
import { EmbeddingService } from './embeddingService.js';

interface MatchResult {
  id: string;
  text: string;
  similarity: number;
  rating: number;
}

export class ResponseMatcher {
  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  async findBestMatch(
    query: string,
    intentId: string,
    orgId: string
  ): Promise<MatchResult | null> {
    try {
      const embedding = await this.embeddingService.generateEmbedding(query);
      
      const cacheKey = `responses:${orgId}:${intentId}`;
      let responses = cache.get(cacheKey);
      
      if (!responses) {
        responses = await this.fetchResponses(orgId, intentId);
        cache.set(cacheKey, responses, 300);
      }

      if (!responses || responses.length === 0) {
        return null;
      }

      const result = await db.query(
        `SELECT * FROM app.search_responses($1, $2, $3, $4)`,
        [`[${embedding.join(',')}]`, intentId, orgId, 10]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const best = result.rows[0];
      
      return {
        id: best.response_id,
        text: best.response_text,
        similarity: parseFloat(best.similarity),
        rating: parseFloat(best.rating)
      };
    } catch (error) {
      logger.error('Response matching error:', error);
      return null;
    }
  }

  private async fetchResponses(orgId: string, intentId: string): Promise<any[]> {
    const result = await db.query(
      `SELECT r.id, r.text, r.rating
       FROM app.responses r
       WHERE r.org_id = $1 AND r.intent_id = $2
       ORDER BY r.rating DESC
       LIMIT 100`,
      [orgId, intentId]
    );

    return result.rows;
  }

  async preloadTopResponses(orgId: string): Promise<void> {
    try {
      const result = await db.query(
        `SELECT r.id, r.text, r.intent_id, i.label
         FROM app.responses r
         JOIN app.intents i ON i.id = r.intent_id
         WHERE r.org_id = $1 AND r.rating >= 0.7
         ORDER BY r.rating DESC
         LIMIT 100`,
        [orgId]
      );

      for (const row of result.rows) {
        const cacheKey = `responses:${orgId}:${row.intent_id}`;
        if (!cache.has(cacheKey)) {
          const responses = await this.fetchResponses(orgId, row.intent_id);
          cache.set(cacheKey, responses, 300);
        }
      }

      logger.info(`Preloaded ${result.rows.length} top responses for org ${orgId}`);
    } catch (error) {
      logger.error('Failed to preload responses:', error);
    }
  }
}