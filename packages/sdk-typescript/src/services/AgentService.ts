import { BaseService } from './BaseService';
import { Agent, CreateAgentParams, CreateAgentResponse } from '../types';

export class AgentService extends BaseService {
  /**
   * Create a new agent
   */
  async create(params: CreateAgentParams): Promise<CreateAgentResponse> {
    if (!this.config.userId) {
      throw new Error('userId is required to create an agent');
    }

    return this.request<CreateAgentResponse>('POST', '/api/v1/agents', {
      body: params
    });
  }

  /**
   * Get agent details
   */
  async get(agentId: string): Promise<Agent> {
    return this.request<Agent>('GET', `/api/v1/agents/${agentId}`);
  }

  /**
   * List agents with optional filters
   */
  async list(params?: {
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ agents: Agent[]; total: number }> {
    return this.request('GET', '/api/v1/agents', {
      queryParams: params ? {
        ...(params.search && { search: params.search }),
        ...(params.limit && { limit: params.limit.toString() }),
        ...(params.offset && { offset: params.offset.toString() })
      } : undefined
    });
  }

  /**
   * Get agent's wallet information
   */
  async getWallet(agentId: string): Promise<{
    balance: string;
    address: string;
    transactions: number;
  }> {
    return this.request('GET', `/api/v1/agents/${agentId}/wallet`);
  }

  /**
   * Get agent's task history
   */
  async getTasks(
    agentId: string,
    role: 'client' | 'tool' = 'client'
  ): Promise<{ tasks: any[] }> {
    return this.request('GET', `/api/v1/agents/${agentId}/tasks`, {
      queryParams: { role }
    });
  }
}