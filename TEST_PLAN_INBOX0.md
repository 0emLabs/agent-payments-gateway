# Testing Agent Payments Gateway with Inbox0

## Overview

Inbox0 will be our first test application to validate the SDK and API functionality. We'll test:
1. Agent creation and wallet provisioning
2. Token counting for email processing
3. Task execution with payments
4. Tool registration for email operations

## Test Scenarios

### 1. Agent Setup for Inbox0

```typescript
// Test creating an Inbox0 agent
const paymentAPI = new PaymentAPIService();

const inbox0Agent = await paymentAPI.createAgent({
  name: "Inbox0 Email Assistant",
  description: "AI agent for email management and automation",
  metadata: {
    service: "inbox0",
    capabilities: ["email-read", "email-write", "email-categorize"]
  },
  wallet: {
    type: "smart-wallet",
    chain: "base"
  }
});

console.log("Agent ID:", inbox0Agent.id);
console.log("Wallet Address:", inbox0Agent.wallet.address);
```

### 2. Token Estimation for Email Processing

```typescript
const tokenService = new TokenCountingService();

// Test cases for different email operations
const testCases = [
  {
    operation: "categorize_email",
    text: "Subject: Important: Q3 Financial Report\n\nDear Team,\n\nPlease find attached the Q3 financial report...",
    model: "gpt-4"
  },
  {
    operation: "generate_reply",
    text: "Compose a professional response declining a meeting invitation",
    model: "claude-3-opus"
  },
  {
    operation: "summarize_thread",
    text: "[Long email thread with 20 messages]",
    model: "gpt-3.5-turbo"
  }
];

for (const testCase of testCases) {
  const estimation = await tokenService.estimateTokens(
    testCase.text,
    testCase.model,
    true, // include escrow
    15    // 15% buffer
  );
  
  console.log(`Operation: ${testCase.operation}`);
  console.log(`Model: ${testCase.model}`);
  console.log(`Tokens: ${estimation.total_tokens}`);
  console.log(`Cost: $${estimation.cost.toFixed(4)}`);
  console.log(`With Escrow: $${estimation.escrow?.total_cost.toFixed(4)}`);
  console.log("---");
}
```

### 3. Register Inbox0 Tools

```typescript
// Register email processing tools
const emailTools = [
  {
    name: "inbox0_categorize_email",
    description: "Categorize emails into folders using AI",
    author_agent_id: inbox0Agent.id,
    pricing_model: "per-call" as const,
    price_amount: 0.01,
    endpoint_url: "https://inbox0-api.example.com/categorize",
    input_schema: {
      type: "object",
      properties: {
        email_id: { type: "string" },
        categories: { 
          type: "array", 
          items: { type: "string" }
        }
      },
      required: ["email_id"]
    },
    tags: ["email", "categorization", "ai"]
  },
  {
    name: "inbox0_generate_reply",
    description: "Generate AI-powered email replies",
    author_agent_id: inbox0Agent.id,
    pricing_model: "per-token" as const,
    price_amount: 0.00002, // $0.02 per 1k tokens
    endpoint_url: "https://inbox0-api.example.com/generate-reply",
    input_schema: {
      type: "object",
      properties: {
        email_id: { type: "string" },
        reply_style: { 
          type: "string",
          enum: ["professional", "casual", "brief"]
        },
        key_points: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["email_id", "reply_style"]
    },
    tags: ["email", "generation", "ai", "writing"]
  }
];

for (const tool of emailTools) {
  const registered = await paymentAPI.registerTool(tool);
  console.log(`Registered tool: ${registered.name} (ID: ${registered.id})`);
}
```

### 4. Execute Email Task with Payment

```typescript
// Test user agent wants to use Inbox0's email categorization
const userAgent = await paymentAPI.createAgent({
  name: "Test User Agent",
  description: "Agent representing a test user"
});

// Execute categorization task
const task = await paymentAPI.executeTask({
  from_agent_id: userAgent.id,
  to_agent_id: inbox0Agent.id,
  tool_name: "inbox0_categorize_email",
  parameters: {
    email_id: "test-email-123",
    categories: ["work", "personal", "spam", "newsletters"]
  },
  payment: {
    amount: 0.01,
    currency: "USDC",
    chain: "base"
  },
  options: {
    estimate_tokens: true,
    escrow_buffer_percent: 15
  }
});

console.log("Task ID:", task.id);
console.log("Status:", task.status);
console.log("Escrow ID:", task.escrow?.id);

// Poll for task completion
let taskStatus;
do {
  await new Promise(resolve => setTimeout(resolve, 2000));
  taskStatus = await paymentAPI.getTask(task.id);
  console.log("Task status:", taskStatus.status);
} while (taskStatus.status === "processing");

// Get task result
if (taskStatus.status === "completed") {
  const result = await paymentAPI.getTaskResult(task.id);
  console.log("Categorization result:", result);
}
```

### 5. Test Wallet Operations

```typescript
// Check Inbox0 agent balance
const wallet = await paymentAPI.getWallet(inbox0Agent.wallet.id);
console.log("Inbox0 Wallet Balance:");
console.log("USDC:", wallet.balance.USDC);
console.log("ETH:", wallet.balance.ETH);

// Test smart wallet features
const alchemyWallet = new AlchemyWalletService();

// Create session key for automated operations
const sessionKey = await alchemyWallet.createSessionKey(
  inbox0Agent.wallet.address,
  "0xAutomationSignerAddress",
  {
    max_amount_per_tx: 1, // $1 USDC max per transaction
    max_total_amount: 10, // $10 USDC total
    allowed_contracts: [TOKENS.USDC.address.base],
    expiry_timestamp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
  }
);

console.log("Session Key Created:", sessionKey.id);
```

### 6. Integration Test Script

Create `test-inbox0-integration.ts`:

```typescript
import { PaymentAPIService, TokenCountingService } from '@agent-payments/sdk';
import { AlchemyWalletService } from '@agent-payments/sdk/wallets';

async function testInbox0Integration() {
  console.log("🚀 Starting Inbox0 Integration Test");
  
  try {
    // Initialize services
    const paymentAPI = new PaymentAPIService();
    const tokenService = new TokenCountingService();
    const walletService = new AlchemyWalletService();
    
    // Test 1: Create Agent
    console.log("\n📧 Test 1: Creating Inbox0 Agent...");
    const agent = await createInbox0Agent(paymentAPI);
    
    // Test 2: Token Estimation
    console.log("\n🔢 Test 2: Estimating Token Costs...");
    await testTokenEstimation(tokenService);
    
    // Test 3: Register Tools
    console.log("\n🛠️ Test 3: Registering Email Tools...");
    await registerEmailTools(paymentAPI, agent.id);
    
    // Test 4: Execute Task
    console.log("\n💰 Test 4: Executing Email Task with Payment...");
    await executeEmailTask(paymentAPI, agent.id);
    
    // Test 5: Wallet Operations
    console.log("\n👛 Test 5: Testing Wallet Operations...");
    await testWalletOperations(paymentAPI, walletService, agent);
    
    console.log("\n✅ All tests completed successfully!");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testInbox0Integration();
```

## Local Testing Setup

1. **Run the API locally**:
```bash
cd apps/api
wrangler dev --local
```

2. **Set up test environment**:
```env
VITE_PAYMENT_GATEWAY_URL=http://localhost:8787
VITE_UTC_API_URL=http://localhost:8000
MCP_AUTH_SECRET=test-secret-key
```

3. **Create test dashboard**:
```typescript
// In 0EM_Frontend, create a test page
import { TokenUsageDashboard } from '@/components/TokenUsageDashboard';
import { ToolsMarketplace } from '@/components/ToolsMarketplace';

export function Inbox0TestPage() {
  const [agentId] = useState("inbox0-test-agent");
  
  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-3xl font-bold">Inbox0 Integration Test</h1>
      
      <section>
        <h2 className="text-2xl font-semibold mb-4">Token Usage</h2>
        <TokenUsageDashboard agentId={agentId} />
      </section>
      
      <section>
        <h2 className="text-2xl font-semibold mb-4">Email Processing Tools</h2>
        <ToolsMarketplace agentId={agentId} />
      </section>
    </div>
  );
}
```

## Success Criteria

- [ ] Agent created with wallet successfully
- [ ] Token estimation returns accurate costs
- [ ] Tools registered and discoverable
- [ ] Payment flow completes end-to-end
- [ ] Escrow created and released properly
- [ ] Wallet balances update correctly
- [ ] Dashboard shows real-time updates
- [ ] No errors in console or logs

## Debugging Tips

1. **Enable verbose logging**:
```typescript
localStorage.setItem('debug', 'agent-payments:*');
```

2. **Check KV storage**:
```bash
wrangler kv:key list --namespace-id=YOUR_NAMESPACE_ID
```

3. **Monitor Durable Objects**:
```bash
wrangler tail --format pretty
```

4. **Test individual endpoints**:
```bash
# Test agent creation
curl -X POST http://localhost:8787/api/agents \
  -H "Authorization: Bearer test-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Agent","description":"Test"}'
```