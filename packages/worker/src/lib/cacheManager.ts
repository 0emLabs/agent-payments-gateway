export class CacheManager {
  private cache: KVNamespace;
  
  constructor(cache: KVNamespace) {
    this.cache = cache;
  }
  
  generateKey(toolName: string, parameters: any): string {
    const paramString = JSON.stringify(parameters, Object.keys(parameters).sort());
    const data = `${toolName}:${paramString}`;
    
    // Create SHA-256 hash
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Use Web Crypto API synchronously (this is a simple hash)
    return `tool:${toolName}:${this.simpleHash(data)}`;
  }
  
  async get(key: string): Promise<any | null> {
    const value = await this.cache.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  
  async set(key: string, value: any, ttl: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.cache.put(key, serialized, { expirationTtl: ttl });
  }
  
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}