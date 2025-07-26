# Agent Payments Gateway - Quick Start Guide

## 🚀 5-Minute Setup

### Prerequisites
- Node.js 18+ or Bun
- Cloudflare account (free tier works)
- Git

### Step 1: Clone and Install

```bash
git clone https://github.com/0emLabs/agent-payments-gateway.git
cd agent-payments-gateway
bun install # or npm install
```

### Step 2: Local Development

```bash
# Start the API locally
cd apps/api
bun run dev

# In another terminal, run tests
cd ../..
./scripts/test-local.sh
```

### Step 3: Deploy to Cloudflare

```bash
# Login to Cloudflare
wrangler login

# Deploy to development
./scripts/deploy.sh dev

# Set your secrets
wrangler secret put MCP_AUTH_SECRET
# Enter a secure random string when prompted
```

## 🧪 Test with Inbox0 Example

```bash
# Run the Inbox0 integration example
cd examples
bun run inbox0-integration.ts
```

## 📚 Integration in Your App

### 1. Install the SDK

```bash
npm install @agent-payments/sdk
# or
bun add @agent-payments/sdk
```

### 2. Basic Usage

```typescript
import { PaymentAPIService, TokenCountingService } from '@agent-payments/sdk';

// Initialize
const paymentAPI = new PaymentAPIService();
const tokenService = new TokenCountingService();

// Create an agent for your service
const agent = await paymentAPI.createAgent({
  name: "My AI Service",
  description: "AI-powered automation",
  wallet: {
    type: "smart-wallet",
    chain: "base"
  }
});

// Estimate token costs
const estimation = await tokenService.estimateTokens(
  "Process this text with AI",
  "gpt-4",
  true, // include escrow
  15    // 15% buffer
);

// Execute a task with payment
const task = await paymentAPI.executeTask({
  from_agent_id: userAgentId,
  to_agent_id: agent.id,
  tool_name: "process_text",
  parameters: { text: "..." },
  payment: {
    amount: 0.01,
    currency: "USDC"
  }
});
```

### 3. Dashboard Integration

```tsx
import { TokenUsageDashboard, ToolsMarketplace } from '@agent-payments/ui';

function MyApp() {
  return (
    <>
      <TokenUsageDashboard agentId={myAgentId} />
      <ToolsMarketplace agentId={myAgentId} />
    </>
  );
}
```

## 🔧 Configuration

### Environment Variables

```env
# API Configuration
PAYMENT_GATEWAY_URL=https://your-api.workers.dev
MCP_AUTH_SECRET=your-secret-key

# Blockchain Configuration  
ALCHEMY_API_KEY=your-alchemy-key
BASE_RPC_URL=https://base.org

# Token Counter
UTC_API_URL=https://utc-api.example.com
```

### Supported Chains
- Base (recommended - low fees)
- Polygon
- Ethereum

### Supported Tokens
- USDC (recommended)
- ETH

## 📖 Common Use Cases

### 1. Email Processing (Inbox0)
```typescript
// Process emails with AI
await processEmailWithPayment(userAgent, inbox0Agent, emailContent);
```

### 2. Content Generation
```typescript
// Generate content with token tracking
const content = await generateContentWithPayment(userAgent, writerAgent, prompt);
```

### 3. Data Analysis
```typescript
// Analyze data with cost estimation
const analysis = await analyzeDataWithPayment(userAgent, analystAgent, dataset);
```

## 🆘 Troubleshooting

### "Unauthorized" Error
- Check your `MCP_AUTH_SECRET` is set correctly
- Verify the Authorization header format: `Bearer YOUR_SECRET`

### "KV namespace not found"
- Run the deployment script which creates namespaces automatically
- Or create manually: `wrangler kv:namespace create "AUTH_STORE"`

### Transaction Failures
- Check agent wallet balances
- Verify escrow amounts include buffer
- Monitor Durable Object logs: `wrangler tail`

## 📞 Support

- Documentation: [0EM_Docs](https://github.com/0emLabs/0EM_Docs)
- Issues: [GitHub Issues](https://github.com/0emLabs/agent-payments-gateway/issues)
- Discord: [Join our community](https://discord.gg/0emlabs)

## 🎯 Next Steps

1. [ ] Deploy your API
2. [ ] Create your first agent
3. [ ] Register your tools
4. [ ] Test payment flows
5. [ ] Integrate into your app

Happy building! 🚀