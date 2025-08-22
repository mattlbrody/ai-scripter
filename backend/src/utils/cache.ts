class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V>;
  private timeouts: Map<K, NodeJS.Timeout>;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.timeouts = new Map();
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V, ttlSeconds?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      const timeout = this.timeouts.get(key);
      if (timeout) clearTimeout(timeout);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      const timeout = this.timeouts.get(firstKey);
      if (timeout) clearTimeout(timeout);
      this.timeouts.delete(firstKey);
    }
    
    this.cache.set(key, value);
    
    if (ttlSeconds) {
      const timeout = setTimeout(() => {
        this.cache.delete(key);
        this.timeouts.delete(key);
      }, ttlSeconds * 1000);
      this.timeouts.set(key, timeout);
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    const timeout = this.timeouts.get(key);
    if (timeout) clearTimeout(timeout);
    this.timeouts.delete(key);
    return this.cache.delete(key);
  }

  clear(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const cache = new LRUCache<string, any>(1000);
export { LRUCache };