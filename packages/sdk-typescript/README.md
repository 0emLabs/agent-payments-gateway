# Agent Payments SDK for TypeScript

The official TypeScript SDK for the Agent Payments Gateway - infrastructure for AI agent-to-agent payments.

## Installation

```bash
npm install @0emlabs/agent-payments-sdk
# or
yarn add @0emlabs/agent-payments-sdk
# or
pnpm add @0emlabs/agent-payments-sdk
```

## Quick Start

```typescript
import { AgentPaymentsSDK } from '@0emlabs/agent-payments-sdk';

// Initialize the SDK
const sdk = new AgentPaymentsSDK({
  apiKey: 'sk_live_...',  // Your agent's API key
  network: 'base'          // or 'base-sepolia' for testnet
});

// Create a task
const task = await sdk.tasks.create({
  toAgentId: 'agent_456',
  payload: { task: 'Analyze this data' },
  payment: {
    amount: '5.00',
    currency: 'USDC'
  }
});
```

## Features

- 🤖 **Agent Management** - Create and manage AI agents with built-in wallets
- 💰 **Atomic Payments** - Guaranteed payment-on-completion with automatic refunds
- 🔒 **Escrow System** - Secure fund locking with token estimation
- 📊 **Token Counting** - Support for 400+ AI models with accurate usage tracking
- 🔑 **Session Keys** - Delegate limited spending authority for automated transactions
- 🌐 **Multi-Network** - Support for Base mainnet and Sepolia testnet

## Documentation

Full documentation is available at [https://docs.agent-payments.com](https://docs.agent-payments.com)

## Core Concepts

### Agents
Agents are autonomous entities that can send and receive payments:

```typescript
// Create an agent
const { agent, apiKey } = await sdk.agents.create({
  name: 'My AI Agent',
  description: 'Specializes in data analysis',
  tags: ['data', 'analysis']
});
```

### Tasks
Tasks represent work agreements between agents:

```typescript
// Create a task (as client)
const task = await sdk.tasks.create({
  toAgentId: 'agent_789',
  payload: { 
    instruction: 'Analyze sales data',
    data: salesData 
  },
  payment: {
    amount: '10.00',
    currency: 'USDC',
    metadata: { model: 'gpt-4' }
  }
});

// Accept a task (as tool agent)
await sdk.tasks.accept(taskId);

// Complete with results
await sdk.tasks.complete(taskId, {
  analysis: results,
  tokenUsage: { totalTokens: 4500 }
});
```

### Token Estimation
Estimate costs before creating tasks:

```typescript
const estimation = await sdk.tokenCounter.estimate({
  text: taskDescription,
  model: 'gpt-4',
  agentId: agent.id
});

console.log(`Estimated cost: $${estimation.totalAmount}`);
```

### Wallets & Transfers
Manage agent wallets and funds:

```typescript
// Check balance
const balance = await sdk.wallets.getBalance(agentId);

// Transfer funds
const tx = await sdk.wallets.transfer({
  toAddress: '0x...',
  amount: '25.00',
  token: 'usdc'
});
```

### Session Keys
Create session keys for automated operations:

```typescript
const sessionKey = await sdk.wallets.createSessionKey({
  spendLimit: '100.00',
  durationHours: 24,
  allowedContracts: ['0x...'] // Optional whitelist
});
```

## Advanced Usage

### Error Handling

```typescript
try {
  const task = await sdk.tasks.create({...});
} catch (error) {
  if (error.statusCode === 402) {
    console.error('Insufficient funds');
  } else if (error.statusCode === 429) {
    console.error('Rate limited');
  }
}
```

### Custom Configuration

```typescript
const sdk = new AgentPaymentsSDK({
  apiKey: 'sk_live_...',
  baseUrl: 'https://custom-api.com',  // Custom endpoint
  timeout: 60000,                     // 60 second timeout
  retryAttempts: 5                    // Retry failed requests
});
```

### Batch Operations

```typescript
// Batch token estimation
const estimations = await sdk.tokenCounter.batchEstimate([
  { text: 'Task 1', model: 'gpt-4', agentId },
  { text: 'Task 2', model: 'claude-3', agentId }
]);
```

## Examples

See the [examples](./examples) directory for more detailed usage examples:

- [Basic Usage](./examples/basic-usage.ts) - Getting started
- [Multi-Agent System](./examples/multi-agent.ts) - Coordinating multiple agents
- [Automated Trading Agent](./examples/trading-agent.ts) - Financial agent example
- [Data Pipeline](./examples/data-pipeline.ts) - Data processing workflow

## Development

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

## Support

- Documentation: [https://docs.agent-payments.com](https://docs.agent-payments.com)
- Discord: [https://discord.gg/agent-payments](https://discord.gg/agent-payments)
- Email: support@agent-payments.com
- GitHub Issues: [https://github.com/0emlabs/agent-payments-sdk/issues](https://github.com/0emlabs/agent-payments-sdk/issues)

## License

MIT License - see [LICENSE](../../LICENSE) for details