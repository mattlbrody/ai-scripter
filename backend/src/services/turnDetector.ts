export class TurnDetector {
  private maxTokens: number;

  constructor(maxTokens = 128) {
    this.maxTokens = maxTokens;
  }

  extractQuery(text: string, maxTokens?: number): string {
    const limit = maxTokens || this.maxTokens;
    
    const cleaned = text
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tokens = cleaned.split(/\s+/);
    
    if (tokens.length <= limit) {
      return cleaned;
    }

    const segments = this.segmentByPauses(cleaned);
    
    if (segments.length > 1) {
      return this.selectSalientSegments(segments, limit);
    }

    return tokens.slice(-limit).join(' ');
  }

  private segmentByPauses(text: string): string[] {
    const segments = text.split(/[.!?]\s+/);
    
    return segments
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private selectSalientSegments(segments: string[], maxTokens: number): string {
    const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'would', 'could', 'should', 'can', 'will'];
    const importantWords = ['price', 'cost', 'competitor', 'problem', 'issue', 'concern', 'worry', 'need', 'want', 'help'];
    
    const scored = segments.map(segment => {
      const lower = segment.toLowerCase();
      let score = 0;
      
      score += segment.split(/\s+/).length * 0.1;
      
      questionWords.forEach(word => {
        if (lower.includes(word)) score += 2;
      });
      
      importantWords.forEach(word => {
        if (lower.includes(word)) score += 3;
      });
      
      if (segment.endsWith('?')) score += 2;
      
      return { segment, score };
    });

    scored.sort((a, b) => b.score - a.score);

    let result = [];
    let tokenCount = 0;
    
    for (const item of scored) {
      const tokens = item.segment.split(/\s+/);
      if (tokenCount + tokens.length <= maxTokens) {
        result.push(item.segment);
        tokenCount += tokens.length;
      }
    }

    return result.join(' ');
  }

  detectTurnBoundary(
    transcript: string,
    silenceDurationMs: number,
    isFinal: boolean
  ): boolean {
    const silenceThreshold = parseInt(process.env.TURN_SILENCE_MS || '200');
    
    if (silenceDurationMs >= silenceThreshold && isFinal) {
      return true;
    }

    const endsWithPunctuation = /[.!?]$/.test(transcript.trim());
    if (endsWithPunctuation && silenceDurationMs >= silenceThreshold / 2) {
      return true;
    }

    return false;
  }
}