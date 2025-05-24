export interface Agent {
  id: string;
  name: string;
  ownerId: string;
  reputationScore: number;
  createdAt: Date;
}

export interface CreateAgentParams {
  name: string;
  ownerId: string;
  description?: string;
  tags?: string[];
}

export interface CreateAgentResponse {
  agent: Agent;
  apiKey: string;
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
  last_active: string;
  status: 'active' | 'inactive' | 'suspended';
}