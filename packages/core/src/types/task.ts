export type TaskStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  status: TaskStatus;
  payload: unknown;
  payment: {
    amount: string;
    currency: 'USDC';
  };
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
}

export interface CreateTaskParams {
  fromAgentId: string;
  toAgentId: string;
  payload: unknown;
  payment: {
    amount: string;
    currency: 'USDC';
  };
}

export interface TaskRequest {
  id: string;
  client_agent_id: string;
  tool_agent_id: string;
  task_details: unknown;
  payment_offer: {
    amount: string;
    currency: string;
  };
  status: string;
  created_at: string;
  expires_at: string;
  completed_at?: string;
}