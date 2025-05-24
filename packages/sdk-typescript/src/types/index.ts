export interface SDKConfig {
  apiKey?: string;
  userId?: string;
  network?: 'base' | 'base-sepolia' | 'local';
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
}

export interface Agent {
  id: string;
  name: string;
  ownerId: string;
  walletAddress?: string;
  reputationScore: number;
  createdAt: Date;
  description?: string;
  tags?: string[];
}

export interface CreateAgentParams {
  name: string;
  description?: string;
  tags?: string[];
}

export interface CreateAgentResponse {
  agent: Agent;
  apiKey: string;
}

export interface Task {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  status: TaskStatus;
  payload: any;
  payment: TaskPayment;
  result?: any;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  escrowId?: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

export interface TaskPayment {
  amount: string;
  currency: 'USDC';
  metadata?: Record<string, any>;
}

export interface CreateTaskParams {
  toAgentId: string;
  payload: any;
  payment: TaskPayment;
}

export interface TokenEstimation {
  estimatedTokens: number;
  estimatedCost: number;
  bufferAmount: number;
  totalAmount: number;
  model: string;
  pricePerToken: number;
}

export interface WalletBalance {
  native: string;
  usdc: string;
}

export interface SessionKey {
  id: string;
  address: string;
  permissions: {
    spendLimit: string;
    validFrom: number;
    validUntil: number;
    allowedContracts: string[];
  };
  isActive: boolean;
  createdAt: string;
}

export interface EscrowDetails {
  escrowId: string;
  lockedAmount: string;
  estimatedCost: string;
  bufferAmount: string;
  expiresAt: string;
  status: 'active' | 'released' | 'refunded' | 'expired';
}

export interface TransferParams {
  toAddress: string;
  amount: string;
  token?: 'native' | 'usdc';
}

export interface APIError {
  error: string;
  message?: string;
  code?: string;
  statusCode: number;
}