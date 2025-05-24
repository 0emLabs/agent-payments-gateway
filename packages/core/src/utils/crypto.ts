/**
 * Generate a secure API key
 */
export function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return 'sk_live_' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash an API key for secure storage
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return 'task_' + crypto.randomUUID().replace(/-/g, '');
}

/**
 * Generate a unique transaction ID
 */
export function generateTransactionId(): string {
  return 'tx_' + crypto.randomUUID().replace(/-/g, '');
}

/**
 * Verify a webhook signature
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  
  const signatureBytes = hexToBytes(signature);
  const dataBytes = encoder.encode(body);
  
  return crypto.subtle.verify('HMAC', key, signatureBytes, dataBytes);
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}