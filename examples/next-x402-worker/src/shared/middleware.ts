import { Context, Next } from 'hono';

// Standard CORS configuration
export const STANDARD_CORS_CONFIG = {
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-ID', 'X-Payment', 'X-Payment-Response'],
  credentials: true
};

// Security headers middleware
export const securityHeaders = async (c: Context, next: Next) => {
  await next();
  
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
};

// Request logger middleware
export const requestLogger = async (c: Context, next: Next) => {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status;
  
  console.log(`[${new Date().toISOString()}] ${method} ${url} - ${status} (${duration}ms)`);
};

// Rate limiter middleware (simple in-memory implementation for demo)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export const rateLimiter = (requests: number, windowMinutes: number) => {
  return async (c: Context, next: Next) => {
    const clientId = c.req.header('CF-Connecting-IP') || 'unknown';
    const windowMs = windowMinutes * 60 * 1000;
    const now = Date.now();
    
    // Clean old entries
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key);
      }
    }
    
    const current = rateLimitStore.get(clientId) || { count: 0, resetTime: now + windowMs };
    
    if (now > current.resetTime) {
      current.count = 0;
      current.resetTime = now + windowMs;
    }
    
    current.count++;
    rateLimitStore.set(clientId, current);
    
    if (current.count > requests) {
      return c.json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((current.resetTime - now) / 1000)
      }, 429);
    }
    
    await next();
  };
};

// Error handler middleware
export const errorHandler = (err: Error, c: Context) => {
  console.error('Unhandled error:', err);
  
  return c.json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  }, 500);
};
