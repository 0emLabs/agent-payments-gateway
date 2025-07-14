import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { 
  errorHandler, 
  rateLimiter, 
  securityHeaders, 
  requestLogger, 
  STANDARD_CORS_CONFIG 
} from './shared/middleware';
import { 
  x402Middleware, 
  X402Config
} from './x402-hono';

// Use your wallet address as the payment destination
const WORKER_PAYMENT_ADDRESS = '0x73e741aEC0a1a3134a444d865b591d7363c5Be71' as `0x${string}`;

// Environment interface for Cloudflare Worker
interface Env {
  USDC_CONTRACT_ADDRESS: string;
  PAYMENT_DESTINATION?: string;
  ALLOWED_ORIGINS?: string;
  FACILITATOR_URL?: string;
  [key: string]: any; // Add index signature for Hono compatibility
}

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// X402 Configuration with official facilitator
const x402Config: X402Config = {
  paymentAmount: '1000', // 0.001 USDC (1000 atomic units for 6-decimal USDC)
  token: 'USDC',
  network: 'base-sepolia',
  paymentDestination: WORKER_PAYMENT_ADDRESS, // Will be overridden by env var if provided
  x402Version: 1,
  facilitatorUrl: 'https://x402.org/facilitator' // Official X402 testnet facilitator
};

// Enable CORS and standard middleware
app.use('*', cors(STANDARD_CORS_CONFIG));
app.use('*', securityHeaders);
app.use('*', requestLogger);
app.use('/api/*', rateLimiter(60, 60)); // 60 requests per 60 minutes for API routes
app.use('/paid/*', rateLimiter(30, 60)); // 30 requests per 60 minutes for paid routes
app.onError(errorHandler);

// Apply X402 middleware to protected routes
// This will automatically protect any route starting with /paid/
app.use('/paid/*', x402Middleware(x402Config));

// Health check
app.get('/_health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'X402 Payment Worker',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    protocol: 'X402 v1 (Official Spec Compliant)',
    facilitator: x402Config.facilitatorUrl || 'Local validation only'
  });
});

// API info endpoint with X402 information
app.get('/', (c) => {
  const paymentDestination = c.env.PAYMENT_DESTINATION || WORKER_PAYMENT_ADDRESS;
  
  const info = {
    service: 'X-402 Payment Worker (Official Spec Compliant)',
    version: '1.0.0',
    protocol: {
      x402Version: 1,
      standard: 'https://github.com/coinbase/x402',
      description: 'HTTP-native payments using the 402 status code',
      facilitator: x402Config.facilitatorUrl || 'Local validation only'
    },
    payment: {
      required: true,
      amount: x402Config.paymentAmount + ' atomic units', // 1000 = 0.001 USDC
      token: x402Config.token,
      destination: paymentDestination,
      network: x402Config.network,
      scheme: 'exact',
      asset: c.env.USDC_CONTRACT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    },
    usage: {
      flow: [
        '1. Request protected resource',
        '2. Receive 402 Payment Required with payment details in "accepts" array',
        '3. Create signed payment payload using ERC-3009 transferWithAuthorization',
        '4. Retry request with X-Payment header (base64 encoded JSON)',
        '5. Server verifies payment with facilitator service',
        '6. Access granted with X-Payment-Response header'
      ],
      headers: {
        'X-Payment': 'base64(JSON payload with cryptographic payment authorization)',
        'X-Payment-Response': 'base64(JSON response with settlement details)'
      },
      note: 'This implementation follows the official X402 specification with ERC-3009 payment authorization and facilitator verification'
    },
    endpoints: {
      '/': 'API information',
      '/_health': 'Health check',
      '/paid/data': 'Protected content (requires 0.001 USDC payment)',
      '/paid/premium': 'Premium content example',
      '/paid/manual': 'Manually protected route example'
    }
  };

  return c.json(info, 200);
});

// API info alias
app.get('/api/info', (c) => {
  // Redirect to main info endpoint
  return c.redirect('/');
});

// Protected routes using X402 middleware

// Premium data endpoint (protected by X402)
app.get('/paid/data', (c) => {
  return c.json({
    message: '🔐 Premium Content Unlocked!',
    x402Protocol: 'Official specification compliant',
    data: {
      secretKey: 'abc123xyz789',
      premiumFeature: 'Advanced analytics enabled',
      timestamp: new Date().toISOString(),
      exclusive: 'This content is only available to paying users'
    },
    payment: {
      verified: true,
      protocol: 'X402 v1 (Official Spec)'
    }
  });
});

// Premium content endpoint
app.get('/paid/premium', (c) => {
  return c.json({
    content: '🚀 Premium Content Area',
    description: 'This is premium content that requires payment to access',
    features: [
      'Exclusive data access',
      'Priority support', 
      'Advanced features',
      'Real-time updates'
    ],
    payment: {
      verified: true,
      protocol: 'X402 v1 (Official Spec)'
    },
    timestamp: new Date().toISOString()
  });
});

// Example of manually protected route - now handled by middleware
app.get('/paid/manual', (c) => {
  return c.json({
    message: 'Manually protected route with X402',
    content: 'This route is protected by the official X402 middleware',
    timestamp: new Date().toISOString()
  });
});

// Catch-all route for 404s
app.all('*', (c) => {
  const path = c.req.path;
  console.error(`[404] Unhandled route: ${c.req.method} ${path}`);

  return c.json({
    error: 'Route not found',
    path: path,
    method: c.req.method,
    availableRoutes: [
      'GET /',
      'GET /_health',
      'GET /api/info',
      'GET /paid/data (requires X402 payment)',
      'GET /paid/premium (requires X402 payment)',
      'GET /paid/manual (requires X402 payment)'
    ],
    note: 'All /paid/* routes require payment via X402 protocol'
  }, 404);
});

export default app;
