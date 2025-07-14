# X402 Payment Worker

A **Hono-powered** Cloudflare Worker implementing the **official X402 payment protocol** with USDC payments on Base Sepolia.

This implementation is **fully compliant** with the [official X402 specification](https://github.com/coinbase/x402) created by Coinbase, using proper HTTP 402 status codes, X-Payment headers, structured payment payloads, and the **official Coinbase facilitator service** (`https://x402.org/facilitator`) for cryptographic verification and settlement.

> **🔥 Coinbase Facilitator Integration**: This worker now uses the official Coinbase facilitator service at `https://x402.org/facilitator` for ERC-3009 payment verification and settlement, ensuring full compliance with the X402 specification.

## ✅ Official X402 Compliance

This implementation follows the official X402 specification exactly:

- **✅ Proper 402 responses** with `accepts` array containing `PaymentRequirements`
- **✅ X-Payment header** with base64-encoded JSON payment payloads
- **✅ ERC-3009 payment scheme** using `transferWithAuthorization` signatures
- **✅ Facilitator integration** with `/verify` and `/settle` endpoints
- **✅ X-Payment-Response header** with settlement details
- **✅ Official error codes** and validation as per the spec

## Features

- 🔒 **X402 Protocol Compliant** - Follows the official specification exactly
- 🚀 **Hono Framework** - Fast, lightweight, and easy to use
- 🛠️ **Middleware Architecture** - Simple `.use()` integration
- 💰 **0.001 USDC payments** - Micropayments on Base Sepolia testnet  
- 🌐 **Edge deployment** - Fast global response times via Cloudflare
- 🛡️ **Facilitator verification** - Uses official X402 facilitator service
- 🔄 **CORS support** - Ready for browser-based applications
- 📦 **Standard Headers** - Uses X-Payment and X-Payment-Response headers

## Quick Start

### 1. Install Dependencies

```bash
cd x402-worker
npm install
```

### 2. Configure Environment

```bash
# Set environment variables in wrangler.toml or .env
USDC_CONTRACT_ADDRESS="0x036CbD53842c5426634e7929541eC2318f3dCF7e"
PAYMENT_DESTINATION="your_wallet_address"
FACILITATOR_URL="https://x402.org/facilitator"  # Official X402 testnet facilitator
```

### 3. Usage with Hono

```typescript
import { Hono } from 'hono';
import { x402Middleware, protectedRoute } from './x402-hono';

const app = new Hono();

// Configure X402 with official facilitator
const x402Config = {
  paymentAmount: '1000', // 0.001 USDC (1000 atomic units)
  token: 'USDC',
  network: 'base-sepolia', 
  paymentDestination: 'YOUR_WALLET_ADDRESS',
  facilitatorUrl: 'https://x402.org/facilitator'
};

// Method 1: Protect all routes under /paid/
app.use('/paid/*', x402Middleware(x402Config));

app.get('/paid/data', (c) => {
  return c.json({ message: 'This requires payment!' });
});

// Method 2: Protect individual routes
app.get('/premium', protectedRoute(x402Config, async (c, verification) => {
  return c.json({ 
    message: 'Premium content',
    payer: verification.payer
  });
}));

export default app;
```

### 4. Deploy

```bash
# Development
npm run dev

# Production
npm run deploy
```

## Quick Start

### 1. Install Dependencies

```bash
cd x402-worker
npm install
```

### 2. Configure Environment

Update `wrangler.toml` or set environment variables:

```toml
[vars]
USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
PAYMENT_DESTINATION = "your_wallet_address"
ALLOWED_ORIGINS = "https://yourdomain.com"
```

### 3. Usage with Hono

```typescript
import { Hono } from 'hono';
import { x402Middleware, protectedRoute } from './shared/x402-hono';

const app = new Hono();

// Configure X402
const x402Config = {
  paymentAmount: '0.01',
  token: 'USDC',
  network: 'base-sepolia', 
  paymentDestination: 'YOUR_WALLET_ADDRESS'
};

// Method 1: Protect all routes under /paid/
app.use('/paid/*', x402Middleware(x402Config));

app.get('/paid/data', (c) => {
  return c.json({ message: 'This requires payment!' });
});

// Method 2: Protect individual routes
app.get('/premium', protectedRoute(x402Config, async (c, verification) => {
  return c.json({ 
    message: 'Premium content',
    txHash: verification.transactionHash 
  });
}));

export default app;
```

### 4. Deploy

```bash
# Development
npm run dev

# Production  
npm run deploy
```

## API Endpoints

### Public Endpoints (Free)

- `GET /` - API information and usage instructions
- `GET /health` - Health check

### Protected Endpoints (Requires 0.001 USDC)

- `GET /paid/data` - Premium data content
- `GET /paid/premium` - Exclusive premium content
- `GET /paid/manual` - Manual protected route example

## How It Works (Official X402 Protocol)

The X402 protocol follows this **official standard flow**:

1. **Request Protected Content**: Make a request to any `/paid/*` endpoint
2. **Receive 402 Payment Required**: Server returns structured payment requirements with `accepts` array
3. **Create Signed Payment**: Use ERC-3009 `transferWithAuthorization` to create cryptographic payment payload
4. **Retry with X-Payment Header**: Include base64-encoded payment payload with signature
5. **Facilitator Verification**: Server verifies payment with official facilitator service
6. **Payment Settlement**: Facilitator settles payment on blockchain
7. **Access Content**: Receive protected content with X-Payment-Response header

### X402 Protocol Flow

```
Client                    Server                    Facilitator               Blockchain
  |                         |                           |                         |
  |--- GET /paid/data ----->|                           |                         |
  |                         |                           |                         |
  |<-- 402 Payment Required |                           |                         |
  |    (accepts array)      |                           |                         |
  |                         |                           |                         |
  | (Create ERC-3009        |                           |                         |
  |  payment signature)     |                           |                         |
  |                         |                           |                         |
  |--- GET /paid/data ----->|                           |                         |
  |    X-Payment: base64... |                           |                         |
  |                         |                           |                         |
  |                         |--- POST /verify -------->|                         |
  |                         |    (payment payload)     |                         |
  |                         |                           |                         |
  |                         |<-- verification result --|                         |
  |                         |                           |                         |
  |                         |--- POST /settle -------->|                         |
  |                         |    (payment payload)     |                         |
  |                         |                           |                         |
  |                         |                           |--- Submit TX --------->|
  |                         |                           |                         |
  |                         |                           |<-- TX Confirmed -------|
  |                         |                           |                         |
  |                         |<-- settlement response --|                         |
  |                         |                           |                         |
  |<-- 200 OK + Content ---|                           |                         |
  |    X-Payment-Response   |                           |                         |
```

## X402 Headers

- **X-Payment**: Base64-encoded JSON payment payload with ERC-3009 signature
- **X-Payment-Response**: Base64-encoded JSON settlement response from facilitator

## 🏛️ Coinbase Facilitator Integration

This worker integrates with the **official Coinbase facilitator** at `https://x402.org/facilitator` to provide:

### Verification Endpoint (`/verify`)
- **Purpose**: Cryptographically verifies ERC-3009 signatures without executing transactions
- **Request**: Payment payload and requirements
- **Response**: Validation result with detailed error codes
- **Benefits**: Prevents invalid transactions and provides instant feedback

### Settlement Endpoint (`/settle`)
- **Purpose**: Executes the verified payment transaction on-chain
- **Request**: Same payload after successful verification
- **Response**: Transaction hash and settlement confirmation
- **Benefits**: Automatic transaction execution with guaranteed settlement

### Facilitator Benefits
- ✅ **Cryptographic Security**: Full ERC-3009 signature validation
- ✅ **Gas Management**: Facilitator handles transaction execution
- ✅ **Error Handling**: Detailed error responses per X402 spec
- ✅ **Settlement Guarantee**: Verified transactions are guaranteed to settle
- ✅ **No Client Keys**: Client only signs authorization, no direct transaction submission

### Configuration
```toml
# wrangler.toml
FACILITATOR_URL = "https://x402.org/facilitator"
```

The worker automatically:
1. Sends payment payloads to the facilitator for verification
2. Processes facilitator responses according to X402 spec
3. Returns proper error codes for invalid payments
4. Includes settlement details in X-Payment-Response headers

## Payment Payload Structure (Official Spec)

```json
{
  "x402Version": 1,
  "scheme": "exact", 
  "network": "base-sepolia",
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0x...",
      "to": "0x...",
      "value": "1000",
      "validAfter": "1704067200",
      "validBefore": "1704067500",
      "nonce": "0x..."
    }
  }
}
```

## Example Usage

### JavaScript/TypeScript (Official X402 Protocol)

```javascript
async function accessPaidContentX402() {
  const workerUrl = 'https://your-worker.your-subdomain.workers.dev';
  
  try {
    // Step 1: Request protected content (will return 402)
    const response = await fetch(`${workerUrl}/paid/data`);
    
    if (response.status === 402) {
      const paymentRequired = await response.json();
      console.log('Payment required:', paymentRequired);
      
      const requirement = paymentRequired.accepts[0];
      
      // Step 2: Create ERC-3009 payment authorization
      // This requires a crypto wallet that supports ERC-3009 transferWithAuthorization
      // See: https://github.com/coinbase/x402 for client SDK examples
      
      const paymentPayload = {
        x402Version: 1,
        scheme: requirement.scheme,
        network: requirement.network,
        payload: {
          signature: "0x...", // ERC-3009 signature
          authorization: {
            from: "0x...",
            to: requirement.payTo,
            value: requirement.maxAmountRequired,
            validAfter: "...",
            validBefore: "...",
            nonce: "0x..."
          }
        }
      };
      
      // Step 3: Retry with X-Payment header
      const paidResponse = await fetch(`${workerUrl}/paid/data`, {
        headers: {
          'X-Payment': btoa(JSON.stringify(paymentPayload))
        }
      });
      
      if (paidResponse.status === 200) {
        const content = await paidResponse.json();
        console.log('Paid content:', content);
        
        // Check payment response
        const xPaymentResponse = paidResponse.headers.get('X-Payment-Response');
        if (xPaymentResponse) {
          const settlement = JSON.parse(atob(xPaymentResponse));
          console.log('Settlement:', settlement);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### curl (Official X402 Protocol)

```bash
# Step 1: Check payment requirements
curl -v https://your-worker.your-subdomain.workers.dev/paid/data

# Step 2: Create payment payload (after creating ERC-3009 signature)
PAYMENT_PAYLOAD=$(echo '{"x402Version":1,"scheme":"exact","network":"base-sepolia","payload":{"signature":"0x...","authorization":{"from":"0x...","to":"0x...","value":"1000","validAfter":"...","validBefore":"...","nonce":"0x..."}}}' | base64 -w 0)

# Step 3: Retry with X-Payment header
curl -v https://your-worker.your-subdomain.workers.dev/paid/data \
  -H "X-Payment: $PAYMENT_PAYLOAD"
```

## Configuration

### Environment Variables

- `USDC_CONTRACT_ADDRESS` - USDC token contract address on Base Sepolia
- `PAYMENT_DESTINATION` - Your wallet address to receive payments
- `FACILITATOR_URL` - X402 facilitator service URL (defaults to official testnet)
- `ALLOWED_ORIGINS` - CORS allowed origins (optional)

### Payment Settings

Configure in your application:
- `paymentAmount`: Payment amount in atomic units (1000 = 0.001 USDC)
- `facilitatorUrl`: Official X402 facilitator service
- `network`: Base Sepolia for testnet

## Base Sepolia Testnet

- **Network**: Base Sepolia
- **Chain ID**: 84532
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Faucet**: Get test USDC from [Circle Faucet](https://faucet.circle.com/)
- **Official Facilitator**: `https://x402.org/facilitator`

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

## Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy

# Deploy to specific environment
wrangler deploy --env staging
```

## Protocol Implementation Notes

This implementation is **fully compliant** with the official X402 specification:

- **✅ ERC-3009 Authorization**: Uses `transferWithAuthorization` with cryptographic signatures
- **✅ Facilitator Integration**: Integrates with official X402 facilitator for verification and settlement
- **✅ Official Payment Flow**: Follows the exact flow specified in the X402 documentation
- **✅ Proper Error Handling**: Uses official X402 error codes and response formats
- **✅ Standard Headers**: Implements X-Payment and X-Payment-Response as specified

**Key Differences from Custom Implementations:**
- Uses cryptographic payment authorization instead of post-payment transaction verification
- Integrates with facilitator services for verification and settlement
- Follows the official payment payload structure with signatures
- Uses atomic units for amounts (1000 = 0.001 USDC with 6 decimals)

For more details, see the [official X402 repository](https://github.com/coinbase/x402).

## Security Notes

- All payments are verified through the official X402 facilitator service
- Payment verification uses cryptographic signatures (ERC-3009)
- Settlement is handled by the facilitator on-chain
- No sensitive data is stored in the worker
- CORS is configured for browser safety
- Follows official X402 security best practices and standards

## Troubleshooting

- Ensure USDC contract address is correct for Base Sepolia
- Check that payment facilitator is responding
- Verify KV namespace IDs in wrangler.toml
- Test with small amounts first

## Integration Patterns

### Pattern 1: Route-based Protection

```typescript
// Protect entire route groups
app.use('/paid/*', x402Middleware(x402Config));
app.use('/premium/*', x402Middleware(x402Config));
app.use('/api/v1/pro/*', x402Middleware(x402Config));

// All routes under these paths now require payment
app.get('/paid/analytics', (c) => c.json({ data: 'analytics' }));
app.get('/premium/reports', (c) => c.json({ data: 'reports' }));
```

### Pattern 2: Individual Route Protection

```typescript
// Protect specific endpoints
app.get('/expensive-ai-call', protectedRoute(x402Config, async (c, verification) => {
  // Payment verified, verification contains tx details
  const result = await callExpensiveAI();
  return c.json({ result, payment: verification.transactionHash });
}));
```

### Pattern 3: Mixed Free/Paid Content

```typescript
// Free tier
app.get('/api/data/basic', (c) => c.json({ basic: 'data' }));

// Paid tier (requires payment)
app.get('/api/data/advanced', protectedRoute(x402Config, async (c, verification) => {
  return c.json({ 
    advanced: 'data',
    premium: true,
    paidWith: verification.transactionHash 
  });
}));
```

### Pattern 4: Conditional Payment Requirements

```typescript
app.get('/api/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');
  
  // Free for basic searches
  if (limit <= 10) {
    return c.json({ results: basicSearch(query) });
  }
  
  // Use middleware for advanced searches
  return await x402Middleware(x402Config)(c, async () => {
    const verification = getPaymentVerification(c);
    return c.json({ 
      results: advancedSearch(query, limit),
      payment: verification?.transactionHash 
    });
  });
});
```
