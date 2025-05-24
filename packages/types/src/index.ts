// Agent types
export interface Agent {
  id: string;
  name: string;
  ownerId: string;
  reputationScore: number;
  createdAt: string; // Changed from Date
}

export interface AgentWallet {
  address: string;
  balance: string;
  currency: 'USDC';
}

export interface AgentIdentity extends Agent {
  api_key: string;
  description?: string;
  tags: string[];
  wallet: AgentWallet;
  lastActive: string; // Changed from Date
  status: 'active' | 'inactive' | 'suspended';
}

// Task types
export type TaskStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  status: TaskStatus;
  payload: any;
  payment: {
    amount: string;
    currency: 'USDC';
  };
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
}

export interface TaskRequest {
  client_agent_id: string;
  tool_agent_id: string;
  task_details: any;
  payment_offer: { amount: string; currency: 'USDC'; }; // Ensure currency is always USDC
}

export interface CreateTaskParams {
  fromAgentId: string;
  toAgentId: string;
  toolAgentId: string;
  payload: any;
  payment: {
    amount: string;
    currency: 'USDC';
  };
}

// Transaction types
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

// Tool types
export interface ToolManifest {
  manifest_version: '1.0';
  name: string;
  description: string;
  owner_agent_id: string;
  endpoint: {
    url: string;
    method: 'POST' | 'GET';
  };
  authentication?: {
    type: 'api_key' | 'bearer' | 'none';
    header?: string;
  };
  pricing: {
    model: 'per_call' | 'per_token' | 'per_minute';
    amount: string;
    currency: string;
  };
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  tags: string[];
  rate_limit?: {
    requests_per_minute?: number;
    requests_per_hour?: number;
    requests_per_day?: number;
  };
}

// Token usage types
export interface TokenUsage {
  id: string;
  agentId: string;
  model: ModelType;
  promptTokens: number;
  completionTokens: number;
  totalCost: string;
  taskId?: string;
  timestamp: Date;
}

export type ModelType =
  | 'gpt-3.5-turbo'
  | 'gpt-4'
  | 'gpt-4-turbo'
  | 'claude-2'
  | 'claude-3-opus'
  | 'claude-3-sonnet'
  | 'claude-3-haiku'
  | 'gemini-pro'
  | 'gemini-ultra'
  | 'llama-2-70b'
  | 'mixtral-8x7b';

export interface ModelPricing {
  model: ModelType;
  promptCostPer1k: number;
  completionCostPer1k: number;
  currency: 'USD';
}

// Spending limit types
export interface SpendingLimits {
  global: {
    daily?: number;
    weekly?: number;
    monthly?: number;
  };
  perModel?: Record<ModelType, number>;
  perCategory?: Record<string, number>;
  alerts?: AlertConfig[];
}

export interface AlertConfig {
  threshold: number;
  type: 'percentage' | 'absolute';
  channel: 'email' | 'webhook' | 'in-app';
  recipient: string;
}

// API request/response types
export interface RegisterAgentRequest {
  name: string;
  description?: string;
  tags?: string[];
}

export interface DepositRequest {
  amount: string;
  transaction_hash: string;
}

export interface WithdrawRequest {
  amount: string;
  to_address: string;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  tags?: string[];
  status?: 'active' | 'inactive' | 'suspended';
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  tags?: string[];
}

export interface CreateAgentResponse {
  agent: Agent;
  apiKey: string;
}

export interface CreateTaskRequest {
  toAgentId: string;
  payload: unknown;
  payment: {
    amount: string;
    currency: 'USDC';
  };
}

export interface TaskResponse {
  task: Task;
  escrowAmount?: string;
  platformFee?: string;
}

// Error types
export interface APIError {
  error: string;
  message?: string;
  code?: string;
  details?: unknown;
}

// Pagination types
export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
