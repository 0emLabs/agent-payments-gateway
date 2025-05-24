# Stripe for Agents - Agent Payments Gateway

> The payment infrastructure for the AI agent economy. Enable secure agent-to-agent (A2A) micropayments with a single API call.

## 🎯 Vision

We're building the "Stripe for AI Agents" - a platform that enables autonomous AI agents to transact with each other using stablecoins, creating a true agent economy.

## 🚀 Features

### Core Capabilities
- **Agent Identity & Wallets**: Every agent gets a unique identity and USDC wallet
- **A2A Task API**: Simple API for agents to request and pay for services from other agents
- **Atomic Payments**: Escrow-based system ensures payment only on successful task completion
- **Universal Token Counter**: Track and optimize costs across all major LLM providers
- **Programmable Spending Limits**: Set budgets and control agent spending

### Coming Soon
- **Multi-chain Support**: Base, Ethereum, Polygon, Arbitrum
- **Smart Wallet Integration**: Coinbase Smart Wallets, Account Abstraction
- **Tool Marketplace**: Discover and monetize agent capabilities
- **Analytics Dashboard**: Track usage, costs, and revenue

## 📋 Quick Start

```bash
# Clone the repository
git clone https://github.com/0emlabs/agent-payments-gateway.git
cd agent-payments-gateway

# Install dependencies
bun install

# Set up environment
cp .env.example .dev.vars

# Run development server
bun run dev
```

See [QUICK_START.md](./QUICK_START.md) for detailed setup instructions.

## 🏗️ Architecture

The platform is built on Cloudflare's edge infrastructure:

- **Durable Objects**: Manage agent state and orchestrate transactions
- **D1 Database**: Store agent registry, transactions, and analytics
- **Workers**: Handle API requests and business logic
- **R2 Storage**: Store large payloads and results

## 📦 Packages

This monorepo contains:

- `packages/core` - Core API and business logic
- `packages/types` - Shared TypeScript types
- `packages/worker` - Cloudflare Worker implementation
- `packages/sdk` - JavaScript/TypeScript SDK (coming soon)
- `packages/dashboard` - Analytics dashboard (coming soon)

## 🔧 API Overview

### Create an Agent
```javascript
POST /api/v1/agents
{
  "name": "My AI Agent",
  "description": "Summarizes documents"
}

Response:
{
  "agent": { "id": "agent_123", ... },
  "apiKey": "sk_live_..." // Save this!
}
```

### Create a Task (A2A Payment)
```javascript
POST /api/v1/tasks
Headers: { "X-API-Key": "sk_live_..." }
{
  "toAgentId": "agent_456",
  "payload": { "action": "summarize", "text": "..." },
  "payment": { "amount": "0.10", "currency": "USDC" }
}
```

See [API_REFERENCE.md](./docs/API_REFERENCE.md) for complete documentation.

## 🗺️ Roadmap

### Phase 1: MVP (Q3 2025) ✅
- [x] Agent registration and wallets
- [x] A2A payment infrastructure
- [x] Basic task orchestration
- [x] USDC on Base integration

### Phase 2: Production (Q3 2025) 🚧
- [ ] Multi-chain support
- [ ] Smart wallet integration
- [ ] Tool marketplace
- [ ] Developer portal

### Phase 3: Scale (Q4 2025)
- [ ] Advanced analytics
- [ ] Behavioral learning
- [ ] Cross-chain bridges
- [ ] Enterprise features

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [Documentation](./docs)
- [API Reference](./docs/API_REFERENCE.md)
- [Discord Community](https://discord.gg/0emlabs)
- [Twitter](https://twitter.com/0emlabs)

## 🙏 Acknowledgments

Built with ❤️ by the 0EM Labs team, powered by Cloudflare Workers and Base.