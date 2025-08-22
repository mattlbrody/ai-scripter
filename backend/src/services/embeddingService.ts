import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { cache } from '../utils/cache.js';

export class EmbeddingService {
  private openai: OpenAI;
  private model: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = 'text-embedding-3-small';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = `embedding:${text.substring(0, 50)}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return cached as number[];
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
        dimensions: 1536
      });

      const embedding = response.data[0].embedding;
      cache.set(cacheKey, embedding, 3600);
      
      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      
      if (this.model === 'text-embedding-3-large') {
        logger.info('Falling back to text-embedding-3-small');
        this.model = 'text-embedding-3-small';
        return this.generateEmbedding(text);
      }
      
      throw error;
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
        dimensions: 1536
      });

      return response.data.map(d => d.embedding);
    } catch (error) {
      logger.error('Failed to generate batch embeddings:', error);
      throw error;
    }
  }

  calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}