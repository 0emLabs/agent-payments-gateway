# GitHub Issues to Implementation Tasks Mapping

## Issue #3: Universal Wallet Abstraction Layer

### Current Progress (from comments):
- ✅ Base wallet interface created
- ✅ MetaMask provider implemented  
- ✅ WalletConnect v2 provider implemented
- ✅ Coinbase Wallet provider implemented
- 🚧 Wallet selection UI component
- 🚧 Connection persistence improvements

### Required Tasks:
1. **Complete Wallet Manager Integration**
   ```typescript
   // packages/sdk/src/wallets/WalletManager.ts
   export class WalletManager {
     private providers: Map<string, WalletProvider>;
     
     async connect(walletType: WalletType): Promise<Connection>;
     async disconnect(): Promise<void>;
     async getAvailableWallets(): Promise<WalletInfo[]>;
   }
   ```

2. **Add Wallet Icons and Branding**
   - [ ] Create assets directory with wallet logos
   - [ ] Build WalletSelector component
   - [ ] Add wallet detection logic

3. **Implement Connection Error Recovery**
   - [ ] Add retry logic with exponential backoff
   - [ ] Handle network switching
   - [ ] Implement connection state persistence

4. **Multi-account Support**
   - [ ] Allow account switching within wallet
   - [ ] Track multiple agent wallets per user
   - [ ] Implement account balance aggregation

## Issue #8: Universal Token Counter System

### Technical Specification:
```typescript
interface TokenCounter {
  countTokens(text: string, model: ModelType): number;
  estimateCost(tokens: number, model: ModelType): number;
  getModelPricing(model: ModelType): PricingTier;
}
```

### Implementation Tasks:

1. **Create Token Counting Engine**
   ```typescript
   // packages/core/src/tokenCounter/index.ts
   export class UniversalTokenCounter {
     private tokenizers: Map<ModelType, Tokenizer>;
     private cache: LRUCache<string, number>;
     
     async countTokens(text: string, model: ModelType): Promise<number> {
       // Check cache first
       const cacheKey = `${model}:${hash(text)}`;
       if (this.cache.has(cacheKey)) {
         return this.cache.get(cacheKey);
       }
       
       // Get model-specific tokenizer
       const tokenizer = this.getTokenizer(model);
       const count = await tokenizer.encode(text).length;
       
       // Cache result
       this.cache.set(cacheKey, count);
       return count;
     }
   }
   ```

2. **Model-Specific Tokenizers**
   - [ ] GPT-3.5/4: Integrate tiktoken
   - [ ] Claude: Use Anthropic tokenizer
   - [ ] Gemini: Google tokenizer
   - [ ] Open models: HuggingFace tokenizers

3. **Database Schema**
   ```sql
   CREATE TABLE token_usage (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     model TEXT NOT NULL,
     prompt_tokens INTEGER,
     completion_tokens INTEGER,
     total_cost DECIMAL(10,6),
     timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (agent_id) REFERENCES agents(id)
   );
   ```

4. **Cost Calculation Service**
   - [ ] Real-time pricing updates
   - [ ] Historical cost tracking
   - [ ] Predictive cost modeling
   - [ ] Budget alerts

## Issue #12: Programmable Spending Limits

### Configuration Schema:
```typescript
interface SpendingLimits {
  global: {
    daily: number;
    monthly: number;
  };
  perModel: Record<ModelType, number>;
  perCategory: Record<string, number>;
  alerts: AlertConfig[];
}
```

### Implementation Tasks:

1. **Create Limits Engine**
   ```typescript
   // packages/core/src/limits/SpendingLimitsEngine.ts
   export class SpendingLimitsEngine {
     async checkLimit(
       agentId: string, 
       amount: number, 
       category: string
     ): Promise<LimitCheckResult> {
       const limits = await this.getLimits(agentId);
       const usage = await this.getUsage(agentId, category);
       
       return {
         allowed: usage + amount <= limits[category],
         remaining: limits[category] - usage,
         resetAt: this.getResetTime(category)
       };
     }
   }
   ```

2. **Implement Limit Types**
   - [ ] Time-based limits (hourly, daily, monthly)
   - [ ] Category-based limits
   - [ ] Model-specific limits
   - [ ] Dynamic limits based on patterns

3. **Enforcement Mechanism**
   - [ ] Real-time limit checking
   - [ ] Soft limits with warnings
   - [ ] Hard limits with blocking
   - [ ] Override capabilities with 2FA

## Issue #14: Agent Identity Registry (KYA)

### Registry Schema:
```typescript
interface AgentRegistry {
  id: string;
  name: string;
  owner: string;
  reputation: number;
  capabilities: string[];
  compliance: ComplianceStatus;
  created: Date;
  lastActive: Date;
}
```

### Implementation Tasks:

1. **Agent Registration Flow**
   ```typescript
   // packages/core/src/registry/AgentRegistry.ts
   export class AgentRegistry {
     async registerAgent(params: RegisterAgentParams): Promise<Agent> {
       // Validate agent details
       await this.validateAgent(params);
       
       // Create agent identity
       const agent = await this.createAgent(params);
       
       // Initialize reputation
       await this.initializeReputation(agent.id);
       
       // Issue API credentials
       const credentials = await this.issueCredentials(agent.id);
       
       return { agent, credentials };
     }
   }
   ```

2. **Reputation System**
   - [ ] Transaction success rate tracking
   - [ ] Response time metrics
   - [ ] User ratings integration
   - [ ] Behavioral scoring

3. **Compliance Features**
   - [ ] KYA verification levels
   - [ ] Activity monitoring
   - [ ] Suspicious behavior detection
   - [ ] Compliance reporting

## Issue #16: Multi-chain Blockchain Support

### Chain Integration Priority:
1. Base (mainnet) - Q3 2025
2. Ethereum mainnet - Q3 2025
3. Polygon - Q4 2025
4. Arbitrum - Q4 2025

### Implementation Tasks:

1. **Chain Abstraction Layer**
   ```typescript
   // packages/core/src/chains/ChainManager.ts
   export class ChainManager {
     private chains: Map<ChainId, ChainConfig>;
     
     async switchChain(chainId: ChainId): Promise<void>;
     async estimateGas(tx: Transaction): Promise<bigint>;
     async getOptimalChain(amount: number): Promise<ChainId>;
     
     async executeTransaction(
       chainId: ChainId,
       tx: Transaction
     ): Promise<TransactionReceipt>;
   }
   ```

2. **Chain-Specific Implementations**
   - [ ] Base: Optimize for low fees
   - [ ] Ethereum: Handle high gas scenarios
   - [ ] Polygon: Leverage fast finality
   - [ ] Arbitrum: Utilize rollup benefits

3. **Cross-chain Features**
   - [ ] Automatic chain selection
   - [ ] Bridge integration for liquidity
   - [ ] Gas optimization strategies
   - [ ] Fallback mechanisms

## Issue #19: MCP Workers Payment Integration

### Workers to Update:
All 14 MCP service integrations need X402 payment middleware

### Implementation Template:
```typescript
// Standardized payment middleware for all MCP workers
import { X402Middleware } from '@0emlabs/agent-payments-sdk';

export function createPaymentEnabledWorker(config: WorkerConfig) {
  const app = new Hono();
  
  // Add X402 middleware
  app.use('*', X402Middleware({
    amount: config.costPerCall || 0.001,
    currency: 'USDC',
    chain: 'base',
    recipient: config.recipientAddress
  }));
  
  // Add MCP protocol handler
  app.post('/', async (c) => {
    // Existing MCP logic
  });
  
  return app;
}
```

### Per-Worker Tasks:
1. **GitHub MCP** - Add payment for code operations
2. **Notion MCP** - Charge for database queries
3. **Discord MCP** - Monetize message sending
4. **Slack MCP** - Payment for workspace actions
5. **Google Workspace** - Charge for document operations
6. **Telegram MCP** - Monetize bot actions
7. **X (Twitter) MCP** - Payment for tweets
8. **WhatsApp MCP** - Charge for business messaging
9. **Stripe MCP** - Meta: payment for payment processing
10. **AWS MCP** - Charge for cloud operations
11. **Jira MCP** - Payment for issue management
12. **Coinbase MCP** - Charge for crypto operations
13. **Typeform MCP** - Monetize form submissions
14. **Calendar MCP** - Payment for scheduling

## Issue #24: Smart Wallet Decision

### Research Tasks:
1. **Evaluate CDP (Coinbase Developer Platform)**
   - [ ] Test wallet creation APIs
   - [ ] Evaluate gas sponsorship
   - [ ] Check multi-chain support

2. **OnChainKit Integration**
   - [ ] Test React components
   - [ ] Evaluate UX improvements
   - [ ] Check Base optimization

3. **TEE (Trusted Execution Environment)**
   - [ ] Research key security
   - [ ] Evaluate performance impact
   - [ ] Check attestation requirements

4. **Alternative Providers**
   - [ ] Alchemy Account Kit
   - [ ] Thirdweb SDK
   - [ ] Biconomy Smart Accounts
   - [ ] Safe (Gnosis) SDK

### Decision Criteria:
- Developer experience
- Security model
- Cost efficiency
- Multi-chain support
- Performance metrics

## Implementation Priority Matrix

### Critical Path (Must Have for MVP):
1. Agent Registration (Issue #14) - Week 1
2. Basic Wallet Support (Issue #3) - Week 1-2
3. A2A Task API (Core) - Week 2-3
4. Payment Rails (Base only) - Week 3-4
5. Basic Token Counter (Issue #8) - Week 4

### Important (Post-MVP):
1. Spending Limits (Issue #12) - Week 5
2. Multi-chain Support (Issue #16) - Week 6-8
3. Analytics Dashboard (Issue #7) - Week 7-9
4. Developer Portal (Issue #9) - Week 8-10

### Nice to Have:
1. Behavioral Learning (Issue #13)
2. Advanced Dispute Resolution
3. Decentralized Identity
4. Cross-chain Bridges

## Development Workflow

### For Each Issue:
1. Create feature branch: `feature/issue-{number}-{title}`
2. Implement in appropriate package
3. Write comprehensive tests
4. Update documentation
5. Create PR with issue reference
6. Deploy to staging for testing
7. Merge and deploy to production

### Testing Strategy:
- Unit tests for all core functions
- Integration tests for API endpoints
- E2E tests for payment flows
- Load testing for scalability
- Security audits for payment logic