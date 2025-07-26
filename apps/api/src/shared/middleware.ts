import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

export interface Env {
  // KV Namespaces
  AUTH_STORE: KVNamespace;
  PAYMENT_SESSIONS: KVNamespace;
  ESCROW_STORE: KVNamespace;
  RATE_LIMIT_STORE: KVNamespace;

  // Durable Objects
  TRANSACTION_ORCHESTRATOR: DurableObjectNamespace;
  AGENT_STATE: DurableObjectNamespace;

  // Service URLs
  WORKER_URL: string;
  FRONTEND_URL: string;
  UTC_API_URL: string;

  // Secrets
  MCP_AUTH_SECRET: string;
  COINBASE_API_KEY: string;
  COINBASE_API_SECRET: string;
  ALCHEMY_API_KEY: string;
  STRIPE_SECRET_KEY?: string;
  ENCRYPTION_KEY: string;

  // Environment
  ENVIRONMENT: 'development' | 'staging' | 'production';
}

// CORS middleware
export const cors = () => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const origin = c.req.header('Origin');
    const allowedOrigins = [
      'https://payments.0emlabs.com',
      'https://0emlabs.com',
      'http://localhost:3000',
      'http://localhost:5173'
    ];

    if (origin && allowedOrigins.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
    }

    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    c.header('Access-Control-Max-Age', '86400');
    c.header('Access-Control-Allow-Credentials', 'true');

    if (c.req.method === 'OPTIONS') {
      return c.text('', 204);
    }

    await next();
  };
};

// Security headers middleware
export const securityHeaders = () => {
  return async (c: Context, next: Next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    
    await next();
  };
};

// Request ID middleware
export const requestId = () => {
  return async (c: Context, next: Next) => {
    const requestId = c.req.header('X-Request-ID') || crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);
    
    await next();
  };
};

// Logging middleware
export const logger = () => {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const requestId = c.get('requestId');
    
    console.log({
      type: 'request',
      requestId,
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('User-Agent'),
      ip: c.req.header('CF-Connecting-IP')
    });

    await next();

    const duration = Date.now() - start;
    console.log({
      type: 'response',
      requestId,
      status: c.res.status,
      duration
    });
  };
};

// Rate limiting middleware
export const rateLimit = (limit: number = 100, window: number = 60) => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const key = `rate_limit:${ip}`;
    
    const current = await c.env.RATE_LIMIT_STORE.get(key);
    const count = current ? parseInt(current) : 0;
    
    if (count >= limit) {
      throw new HTTPException(429, {
        message: 'Too many requests'
      });
    }
    
    await c.env.RATE_LIMIT_STORE.put(key, String(count + 1), {
      expirationTtl: window
    });
    
    await next();
  };
};

// MCP authentication middleware
export const mcpAuth = () => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: Missing or invalid authorization header'
        }
      }, 401);
    }
    
    const token = authHeader.substring(7);
    
    if (token !== c.env.MCP_AUTH_SECRET) {
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: Invalid token'
        }
      }, 401);
    }
    
    await next();
  };
};

// Error handling middleware
export const errorHandler = () => {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (err) {
      const requestId = c.get('requestId');
      
      console.error({
        type: 'error',
        requestId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      
      if (err instanceof HTTPException) {
        return c.json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: err.message
          }
        }, err.status);
      }
      
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        }
      }, 500);
    }
  };
};