import { Env } from '../types/env';

export class EncryptionService {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }
  
  async encrypt(data: string, tenantId: string): Promise<string> {
    const key = await this.getTenantKey(tenantId);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      dataBuffer
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);
    
    // Return base64 encoded
    return btoa(String.fromCharCode(...combined));
  }  async decrypt(encryptedData: string, tenantId: string): Promise<string> {
    const key = await this.getTenantKey(tenantId);
    
    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    // Convert back to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }
  
  private async getTenantKey(tenantId: string): Promise<CryptoKey> {
    // In production, keys would be stored in Worker Secrets
    // For now, derive a key from tenant ID (NOT SECURE - for demo only)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.env.TENANT_ENCRYPTION_KEYS + tenantId),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode(tenantId),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
}