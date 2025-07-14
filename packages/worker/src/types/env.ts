import { AgentStateDO } from '../durable-objects/AgentStateDO';
import { TransactionOrchestratorDO } from '../durable-objects/TransactionOrchestratorDO';
import { ToolRegistryDO } from '../durable-objects/ToolRegistryDO';
import { RateLimiterDO } from '../durable-objects/RateLimiterDO';
import { ParentOrchestratorDO } from '../durable-objects/ParentOrchestratorDO';
import { ContextControllerDO } from '../durable-objects/ContextControllerDO';

export interface Env {
  // A2A Infrastructure Bindings
  AGENT_STATE: DurableObjectNamespace<AgentStateDO>;
  TRANSACTION_ORCHESTRATOR: DurableObjectNamespace<TransactionOrchestratorDO>;
  TOOL_REGISTRY: DurableObjectNamespace<ToolRegistryDO>;
  RATE_LIMITER: DurableObjectNamespace<RateLimiterDO>;

  // Legacy Slack Objects (backward compatibility)
  PARENT_ORCHESTRATOR: DurableObjectNamespace<ParentOrchestratorDO>;
  CONTEXT_CONTROLLER: DurableObjectNamespace<ContextControllerDO>;

  // Storage Bindings
  TASK_STORAGE: R2Bucket;
  MARKETPLACE_DB: D1Database;
  TOOL_CACHE: KVNamespace;
  AUTH_STORE: KVNamespace;
  STATE_STORE: KVNamespace;

  // Queue Bindings
  TASK_QUEUE: Queue;

  // Environment Variables
  NODE_ENV: string;
  API_BASE_URL: string;
  FRONTEND_APP_URL: string;
  SLACK_SIGNING_SECRET: string;

  // Secrets
  CIRCLE_API_KEY: string;
  JWT_SIGNING_KEY: string;
  TENANT_ENCRYPTION_KEYS: string;
  MCP_AUTH_SECRET: string;
  PLATFORM_FEE_WALLET: string;
}

// A2A System Types
export interface AgentIdentity {
  id: string;
  api_key: string;
  name: string;
  description?: string;
  tags: string[];
  wallet: {
    address: string;
    balance: string;
    currency: 'USDC';
  };
  created_at: string;
  last_active: string;
  status: 'active' | 'inactive' | 'suspended';
}

export interface TaskRequest {
  id: string;
  client_agent_id: string;
  tool_agent_id: string;
  task_details: any;
  payment_offer: {
    amount: string;
    currency: 'USDC';
  };
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  expires_at: string;
}

export interface ToolManifest {
  manifest_version: string;
  name: string;
  description: string;
  owner_agent_id: string;
  endpoint: {
    url: string;
    method: string;
  };
  authentication: {
    type: 'api_key' | 'oauth' | 'none';
    header?: string;
  };
  pricing: {
    model: 'per_call' | 'per_token' | 'per_minute';
    amount: string;
    currency: 'USDC';
  };
  input_schema: any;
  output_schema?: any;
  tags: string[];
  created_at: string;
  updated_at: string;
}
