# Week 1 Implementation Tasks - Stripe for Agents MVP

## Day 1-2: Foundation Setup

### 1. Repository Structure Setup
```bash
# Create proper monorepo structure
cd /Users/affoon/Documents/agent-payments-gateway

# Core packages
mkdir -p packages/core/src/{agents,payments,registry,limits}
mkdir -p packages/sdk/src/{hooks,components,wallets}
mkdir -p packages/dashboard/src/{pages,components,api}

# Shared types
mkdir -p packages/types/src

# Documentation
mkdir -p docs/{api,guides,examples}
```

### 2. Initialize Core Package
```json
// packages/core/package.json
{
  "name": "@0emlabs/agent-payments-core",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --dts",
    "dev": "tsup src/index.ts --dts --watch",
    "test": "vitest"
  },
  "dependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "hono": "^3.0.0",
    "zod": "^3.0.0"
  }
}
```

### 3. Create Database Schema
```sql
-- wrangler d1 create agent-payments-db
-- Add to wrangler.toml: [[d1_databases]]

-- migrations/001_create_agents.sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  wallet_address TEXT,
  reputation_score DECIMAL(3,2) DEFAULT 5.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agents_owner ON agents(owner_id);
CREATE INDEX idx_agents_api_key ON agents(api_key_hash);

-- migrations/002_create_transactions.sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  amount DECIMAL(18,6) NOT NULL,
  currency TEXT DEFAULT 'USDC',
  status TEXT NOT NULL, -- 'pending', 'escrowed', 'completed', 'failed'
  task_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  FOREIGN KEY (from_agent_id) REFERENCES agents(id),
  FOREIGN KEY (to_agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_transactions_from ON transactions(from_agent_id);
CREATE INDEX idx_transactions_to ON transactions(to_agent_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- migrations/003_create_tools.sql
CREATE TABLE tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_agent_id TEXT NOT NULL,
  manifest JSON NOT NULL,
  price_per_call DECIMAL(18,6) NOT NULL,
  currency TEXT DEFAULT 'USDC',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_tools_owner ON tools(owner_agent_id);
CREATE INDEX idx_tools_name ON tools(name);
```

### 4. Implement AgentState Durable Object
```typescript
// packages/core/src/agents/AgentStateDO.ts
import { DurableObject } from 'cloudflare:workers';

export interface AgentState {
  id: string;
  balance: number;
  pendingTransactions: Map<string, Transaction>;
  metadata: {
    name: string;
    owner: string;
    created: Date;
  };
}

export class AgentStateDO extends DurableObject {
  private state: AgentState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = {
      id: '',
      balance: 0,
      pendingTransactions: new Map(),
      metadata: {
        name: '',
        owner: '',
        created: new Date()
      }
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      case '/register':
        return this.handleRegister(request);
      case '/balance':
        return this.handleGetBalance();
      case '/deposit':
        return this.handleDeposit(request);
      case '/withdraw':
        return this.handleWithdraw(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleRegister(request: Request): Promise<Response> {
    const { name, owner, id } = await request.json();
    
    // Initialize agent state
    this.state.id = id;
    this.state.metadata = { name, owner, created: new Date() };
    
    // Persist state
    await this.ctx.storage.put('state', this.state);
    
    return Response.json({
      id: this.state.id,
      name: this.state.metadata.name,
      balance: this.state.balance
    });
  }

  private async handleGetBalance(): Promise<Response> {
    return Response.json({
      balance: this.state.balance,
      currency: 'USDC'
    });
  }

  private async handleDeposit(request: Request): Promise<Response> {
    const { amount, transactionId } = await request.json();
    
    // Update balance
    this.state.balance += amount;
    
    // Persist state
    await this.ctx.storage.put('state', this.state);
    
    return Response.json({
      balance: this.state.balance,
      transactionId
    });
  }

  private async handleWithdraw(request: Request): Promise<Response> {
    const { amount, transactionId } = await request.json();
    
    // Check balance
    if (this.state.balance < amount) {
      return Response.json(
        { error: 'Insufficient balance' },
        { status: 400 }
      );
    }
    
    // Update balance
    this.state.balance -= amount;
    
    // Persist state
    await this.ctx.storage.put('state', this.state);
    
    return Response.json({
      balance: this.state.balance,
      transactionId
    });
  }

  async initialize() {
    // Load state from storage
    const stored = await this.ctx.storage.get('state');
    if (stored) {
      this.state = stored as AgentState;
    }
  }
}
```

## Day 3-4: Core API Implementation

### 5. Create Agent Registry Service
```typescript
// packages/core/src/registry/AgentRegistry.ts
import { Env } from '../types';
import { generateApiKey, hashApiKey } from '../utils/crypto';

export class AgentRegistry {
  constructor(private env: Env) {}

  async createAgent(params: {
    name: string;
    ownerId: string;
  }): Promise<CreateAgentResponse> {
    // Generate unique ID and API key
    const agentId = crypto.randomUUID();
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);

    // Store in D1
    await this.env.DB.prepare(`
      INSERT INTO agents (id, name, owner_id, api_key_hash)
      VALUES (?, ?, ?, ?)
    `).bind(agentId, params.name, params.ownerId, apiKeyHash).run();

    // Create AgentState Durable Object
    const doId = this.env.AGENT_STATE.idFromName(agentId);
    const stub = this.env.AGENT_STATE.get(doId);
    
    await stub.fetch(new Request('http://do/register', {
      method: 'POST',
      body: JSON.stringify({
        id: agentId,
        name: params.name,
        owner: params.ownerId
      })
    }));

    return {
      agent: {
        id: agentId,
        name: params.name,
        ownerId: params.ownerId
      },
      apiKey // Return only once, user must save it
    };
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    const result = await this.env.DB.prepare(`
      SELECT id, name, owner_id, reputation_score, created_at
      FROM agents
      WHERE id = ?
    `).bind(agentId).first();

    return result as Agent | null;
  }

  async validateApiKey(apiKey: string): Promise<Agent | null> {
    const hash = await hashApiKey(apiKey);
    
    const result = await this.env.DB.prepare(`
      SELECT id, name, owner_id, reputation_score
      FROM agents
      WHERE api_key_hash = ?
    `).bind(hash).first();

    return result as Agent | null;
  }
}
```

### 6. Implement Main API Gateway
```typescript
// packages/core/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AgentRegistry } from './registry/AgentRegistry';
import { TaskOrchestrator } from './tasks/TaskOrchestrator';

export interface Env {
  DB: D1Database;
  AGENT_STATE: DurableObjectNamespace;
  TRANSACTION_ORCHESTRATOR: DurableObjectNamespace;
  KV_CACHE: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());

// Agent endpoints
app.post('/api/v1/agents', async (c) => {
  const { name } = await c.req.json();
  const ownerId = c.req.header('X-User-Id'); // From auth
  
  if (!ownerId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const registry = new AgentRegistry(c.env);
  const result = await registry.createAgent({ name, ownerId });
  
  return c.json(result);
});

app.get('/api/v1/agents/:id', async (c) => {
  const agentId = c.req.param('id');
  const registry = new AgentRegistry(c.env);
  const agent = await registry.getAgent(agentId);
  
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }
  
  return c.json(agent);
});

// Wallet endpoints
app.get('/api/v1/agents/:id/wallet', async (c) => {
  const agentId = c.req.param('id');
  
  // Get balance from Durable Object
  const doId = c.env.AGENT_STATE.idFromName(agentId);
  const stub = c.env.AGENT_STATE.get(doId);
  
  const response = await stub.fetch(new Request('http://do/balance'));
  const balance = await response.json();
  
  return c.json(balance);
});

// Task endpoints (A2A payments)
app.post('/api/v1/tasks', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) {
    return c.json({ error: 'API key required' }, 401);
  }
  
  // Validate API key
  const registry = new AgentRegistry(c.env);
  const fromAgent = await registry.validateApiKey(apiKey);
  if (!fromAgent) {
    return c.json({ error: 'Invalid API key' }, 401);
  }
  
  const { toAgentId, payload, payment } = await c.req.json();
  
  // Create task with payment
  const orchestrator = new TaskOrchestrator(c.env);
  const task = await orchestrator.createTask({
    fromAgentId: fromAgent.id,
    toAgentId,
    payload,
    payment
  });
  
  return c.json(task);
});

export default app;
export { AgentStateDO } from './agents/AgentStateDO';
export { TransactionOrchestratorDO } from './transactions/TransactionOrchestratorDO';
```

## Day 5: Testing and Documentation

### 7. Create Test Suite
```typescript
// packages/core/src/__tests__/AgentRegistry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from '../registry/AgentRegistry';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
    registry = new AgentRegistry(env);
  });

  it('should create a new agent', async () => {
    const result = await registry.createAgent({
      name: 'Test Agent',
      ownerId: 'user-123'
    });

    expect(result.agent.name).toBe('Test Agent');
    expect(result.apiKey).toBeDefined();
    expect(result.apiKey).toHaveLength(32);
  });

  it('should validate API key', async () => {
    const { apiKey, agent } = await registry.createAgent({
      name: 'Test Agent',
      ownerId: 'user-123'
    });

    const validated = await registry.validateApiKey(apiKey);
    expect(validated?.id).toBe(agent.id);
  });
});
```

### 8. Create SDK Types Package
```typescript
// packages/types/src/index.ts
export interface Agent {
  id: string;
  name: string;
  ownerId: string;
  reputationScore: number;
  createdAt: Date;
}

export interface Task {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  status: 'pending' | 'accepted' | 'completed' | 'failed';
  payload: unknown;
  payment: {
    amount: string;
    currency: 'USDC';
  };
  createdAt: Date;
  completedAt?: Date;
}

export interface Transaction {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  amount: string;
  currency: string;
  status: 'pending' | 'escrowed' | 'completed' | 'failed';
  taskId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ToolManifest {
  name: string;
  description: string;
  ownerAgentId: string;
  endpoint: {
    url: string;
    method: 'POST' | 'GET';
  };
  pricing: {
    model: 'per_call' | 'per_token';
    amount: string;
    currency: string;
  };
  inputSchema: Record<string, unknown>;
  tags: string[];
}
```

### 9. Create Basic Documentation
```markdown
# Agent Payments API

## Quick Start

### 1. Create an Agent
```bash
curl -X POST https://api.0emlabs.com/v1/agents \
  -H "X-User-Id: your-user-id" \
  -H "Content-Type: application/json" \
  -d '{"name": "My AI Agent"}'
```

Response:
```json
{
  "agent": {
    "id": "agent_abc123",
    "name": "My AI Agent",
    "ownerId": "your-user-id"
  },
  "apiKey": "sk_live_..." // Save this! Cannot be retrieved again
}
```

### 2. Check Agent Balance
```bash
curl https://api.0emlabs.com/v1/agents/{agent-id}/wallet \
  -H "X-API-Key: sk_live_..."
```

### 3. Create a Task (A2A Payment)
```bash
curl -X POST https://api.0emlabs.com/v1/tasks \
  -H "X-API-Key: sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "toAgentId": "agent_xyz789",
    "payload": {
      "action": "summarize",
      "text": "..."
    },
    "payment": {
      "amount": "0.10",
      "currency": "USDC"
    }
  }'
```
```

## Deliverables for Week 1

### Completed:
- [ ] Monorepo structure with proper packages
- [ ] Database schema with migrations
- [ ] AgentState Durable Object
- [ ] Agent Registry service
- [ ] Basic API endpoints
- [ ] Authentication via API keys
- [ ] Test suite foundation
- [ ] Type definitions
- [ ] Basic documentation

### Ready for Week 2:
- Transaction Orchestrator implementation
- Payment escrow mechanism
- Tool registry system
- SDK package development