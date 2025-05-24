/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // D1 Database
  MARKETPLACE_DB: D1Database;

  // Durable Objects
  AGENT_STATE: DurableObjectNamespace;
  TRANSACTION_ORCHESTRATOR: DurableObjectNamespace;
  TOOL_REGISTRY: DurableObjectNamespace;
  RATE_LIMITER: DurableObjectNamespace;

  // KV Namespaces
  KV_CACHE: KVNamespace;

  // Environment Variables
  API_BASE_URL: string;
  PLATFORM_FEE_PERCENT: string;
  USDC_CONTRACT_ADDRESS: string;
  CIRCLE_API_KEY: string;
  
  // Token Counter Integration
  UTC_SERVICE_URL: string;
  UTC_API_KEY: string;
  
  // Escrow Configuration
  ESCROW_BUFFER_PERCENTAGE: string;
  ESCROW_TIMEOUT_MINUTES: string;
  ESCROW_STORE: KVNamespace;
  
  // Wallet Configuration
  ALCHEMY_API_KEY: string;
  ALCHEMY_POLICY_ID: string;
  WALLET_NETWORK: string;
  ALCHEMY_AA_URL: string;
  WALLET_STORE: KVNamespace;
  SMART_WALLET_POLICY_ID?: string;

  // R2 Bucket (for large payloads)
  R2_BUCKET?: R2Bucket;

  // Durable Object Bindings for `packages/worker` (if still in use)
  PARENT_ORCHESTRATOR?: DurableObjectNamespace;
  CONTEXT_CONTROLLER?: DurableObjectNamespace;

  // Queue Bindings for `packages/worker` (if still in use)
  TASK_QUEUE?: Queue;

  // Secrets for `packages/worker` (if still in use)
  SLACK_SIGNING_SECRET?: string;
  JWT_SIGNING_KEY?: string;
  TENANT_ENCRYPTION_KEYS?: string;
  MCP_AUTH_SECRET?: string;
  PLATFORM_FEE_WALLET?: string;

  [key: string]: any; // Add index signature to satisfy Hono's Bindings constraint
}
