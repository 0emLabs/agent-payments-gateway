import { Env } from '../types/env';

export class SlackAuth {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }
  
  async verifySlackRequest(request: Request): Promise<boolean> {
    const signature = request.headers.get('x-slack-signature');
    const timestamp = request.headers.get('x-slack-request-timestamp');
    
    if (!signature || !timestamp) {
      return false;
    }
    
    // Check timestamp to prevent replay attacks
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 60 * 5) {
      return false;
    }
    
    // Get request body
    const body = await request.text();
    
    // Create signature base string
    const sigBasestring = `v0:${timestamp}:${body}`;
    
    // Create HMAC
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.env.SLACK_SIGNING_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(sigBasestring)
    );
    
    const expectedSignature = 'v0=' + this.bufferToHex(signatureBuffer);
    
    return signature === expectedSignature;
  }
  
  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}