import { BaseService } from './BaseService';
import { EscrowDetails } from '../types';

export class EscrowService extends BaseService {
  /**
   * Get escrow details
   */
  async get(escrowId: string): Promise<EscrowDetails> {
    return this.request<EscrowDetails>('GET', `/api/v1/escrow/${escrowId}`);
  }

  /**
   * Get all escrows for an agent
   */
  async listByAgent(
    agentId: string,
    params?: {
      status?: 'active' | 'released' | 'refunded' | 'expired';
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    escrows: EscrowDetails[];
    total: number;
  }> {
    return this.request('GET', `/api/v1/escrow/agent/${agentId}`, {
      queryParams: params ? {
        ...(params.status && { status: params.status }),
        ...(params.limit && { limit: params.limit.toString() }),
        ...(params.offset && { offset: params.offset.toString() })
      } : undefined
    });
  }

  /**
   * Check escrow status in bulk
   */
  async checkBulkStatus(escrowIds: string[]): Promise<
    Record<string, {
      status: EscrowDetails['status'];
      expiresAt: string;
    }>
  > {
    return this.request('POST', '/api/v1/escrow/bulk-status', {
      body: { escrowIds }
    });
  }

  /**
   * Get escrow statistics
   */
  async getStats(agentId?: string): Promise<{
    totalEscrowed: string;
    totalReleased: string;
    totalRefunded: string;
    activeEscrows: number;
    averageEscrowAmount: string;
    averageBufferPercentage: number;
  }> {
    const path = agentId 
      ? `/api/v1/escrow/stats/${agentId}`
      : '/api/v1/escrow/stats';
    
    return this.request('GET', path);
  }
}