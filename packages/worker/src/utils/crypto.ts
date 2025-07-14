/**
 * Crypto utilities for A2A payment system
 * Provides secure API key generation and hashing functions
 */

// Generate a secure API key for agents
export function generateApiKey(): string {
  const prefix = 'sk-live-';
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const keyBody = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return prefix + keyBody;
}

// Hash an API key for secure storage
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify an API key against its hash
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  const computedHash = await hashApiKey(apiKey);
  return computedHash === hash;
}

// Generate a secure transaction ID
export function generateTransactionId(): string {
  const prefix = 'tx_';
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return prefix + id;
}

// Generate a secure task ID
export function generateTaskId(): string {
  const prefix = 'task_';
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return prefix + id;
}

// Generate a secure wallet address (simplified)
export function generateWalletAddress(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(20));
  const address = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return '0x' + address;
}

// Sign a JWT token
export async function signJWT(payload: any, secret: string): Promise<string> {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encoder = new TextEncoder();
  const encodedHeader = btoa(JSON.stringify(header)).replace(/[=]/g, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/[=]/g, '');

  const message = encodedHeader + '.' + encodedPayload;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/[=]/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return message + '.' + encodedSignature;
}

// Verify a JWT token
export async function verifyJWT(token: string, secret: string): Promise<any> {
  const [header, payload, signature] = token.split('.');

  if (!header || !payload || !signature) {
    throw new Error('Invalid JWT format');
  }

  const encoder = new TextEncoder();
  const message = header + '.' + payload;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = new Uint8Array(
    atob(signature.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map(c => c.charCodeAt(0))
  );

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(message)
  );

  if (!valid) {
    throw new Error('Invalid JWT signature');
  }

  return JSON.parse(atob(payload));
}

// Encrypt data for storage
export async function encryptData(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoder.encode(data)
  );

  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...result));
}

// Decrypt data from storage
export async function decryptData(encryptedData: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const data = new Uint8Array(
    atob(encryptedData).split('').map(c => c.charCodeAt(0))
  );

  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );

  return decoder.decode(decrypted);
}
