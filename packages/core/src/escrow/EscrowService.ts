import { Env } from '../types/env';
import { TokenCounterService } from '../tokenCounter/TokenCounterService';
import { ModelType, TaskPayment } from '@0emlabs/agent-payments-types';
import { generateTransactionId } from '../utils/crypto';

export interface EscrowRequest {
  fromAgentId: string;
  toAgentId: string;
  estimatedTokens?: number;
  estimatedCost?: number;
  taskDescription: string;
  model: ModelType | string;
  bufferPercentage?: number;
}

export interface EscrowResult {
  escrowId: string;
  lockedAmount: string;
  estimatedCost: string;
  bufferAmount: string;
  expiresAt: string;
  status: 'active' | 'released' | 'refunded' | 'expired';
}

export interface EscrowRelease {
  escrowId: string;
  actualTokens: number;
  actualCost: number;
  refundAmount?: number;
}

export class EscrowService {
  private tokenCounter: TokenCounterService;
  private env: Env;
  private bufferPercentage: number;
  private expirationMinutes: number;

  constructor(env: Env) {
    this.env = env;
    this.tokenCounter = new TokenCounterService(env);
    this.bufferPercentage = parseFloat(env.ESCROW_BUFFER_PERCENTAGE || '15');
    this.expirationMinutes = parseInt(env.ESCROW_TIMEOUT_MINUTES || '60');
  }

  /**
   * Create an escrow with automatic token estimation
   */
  async createEscrow(request: EscrowRequest): Promise<EscrowResult> {
    try {
      // Get token estimation from UTC service
      const estimation = await this.tokenCounter.estimateTaskCost({
        text: request.taskDescription,
        model: request.model,
        agentId: request.fromAgentId
      });

      // Calculate escrow amount with buffer
      const bufferPercentage = request.bufferPercentage || this.bufferPercentage;
      const estimatedCost = request.estimatedCost || estimation.estimatedCost;
      const bufferAmount = estimatedCost * (bufferPercentage / 100);
      const totalEscrowAmount = estimatedCost + bufferAmount;

      // Generate escrow ID
      const escrowId = generateTransactionId();
      const expiresAt = new Date(Date.now() + this.expirationMinutes * 60 * 1000);

      // Store escrow details in KV
      const escrowData = {
        escrowId,
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        lockedAmount: totalEscrowAmount.toFixed(6),
        estimatedCost: estimatedCost.toFixed(6),
        bufferAmount: bufferAmount.toFixed(6),
        estimatedTokens: estimation.estimatedTokens,
        model: request.model,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString()
      };

      // Store in KV with expiration
      await this.env.ESCROW_STORE.put(
        `escrow:${escrowId}`,
        JSON.stringify(escrowData),
        {
          expirationTtl: this.expirationMinutes * 60
        }
      );

      // Lock funds from agent's wallet
      const lockResult = await this.lockFunds(
        request.fromAgentId,
        totalEscrowAmount.toFixed(6),
        escrowId
      );

      if (!lockResult.success) {
        throw new Error(`Failed to lock funds: ${lockResult.error}`);
      }

      return {
        escrowId,
        lockedAmount: totalEscrowAmount.toFixed(6),
        estimatedCost: estimatedCost.toFixed(6),
        bufferAmount: bufferAmount.toFixed(6),
        expiresAt: expiresAt.toISOString(),
        status: 'active'
      };
    } catch (error) {
      console.error('[EscrowService] Create escrow error:', error);
      throw error;
    }
  }

  /**
   * Release escrow funds based on actual usage
   */
  async releaseEscrow(release: EscrowRelease): Promise<{ success: boolean; refundAmount?: string; error?: string }> {
    try {
      // Get escrow data
      const escrowData = await this.getEscrowData(release.escrowId);
      if (!escrowData) {
        return { success: false, error: 'Escrow not found' };
      }

      if (escrowData.status !== 'active') {
        return { success: false, error: `Escrow is ${escrowData.status}` };
      }

      // Calculate actual cost vs locked amount
      const lockedAmount = parseFloat(escrowData.lockedAmount);
      const actualCost = release.actualCost;
      const refundAmount = lockedAmount - actualCost;

      // Release payment to tool agent
      const releaseResult = await this.releaseFunds(
        escrowData.toAgentId,
        actualCost.toFixed(6),
        release.escrowId
      );

      if (!releaseResult.success) {
        return { success: false, error: `Failed to release funds: ${releaseResult.error}` };
      }

      // Refund excess to client agent if any
      if (refundAmount > 0) {
        const refundResult = await this.refundFunds(
          escrowData.fromAgentId,
          refundAmount.toFixed(6),
          release.escrowId
        );

        if (!refundResult.success) {
          console.error('[EscrowService] Failed to refund excess:', refundResult.error);
        }
      }

      // Update escrow status
      escrowData.status = 'released';
      escrowData.actualTokens = release.actualTokens;
      escrowData.actualCost = actualCost.toFixed(6);
      escrowData.refundAmount = refundAmount > 0 ? refundAmount.toFixed(6) : '0';
      escrowData.releasedAt = new Date().toISOString();

      await this.env.ESCROW_STORE.put(
        `escrow:${release.escrowId}`,
        JSON.stringify(escrowData)
      );

      // Log token usage for analytics
      await this.logTokenUsage({
        agentId: escrowData.fromAgentId,
        model: escrowData.model,
        estimatedTokens: escrowData.estimatedTokens,
        actualTokens: release.actualTokens,
        estimatedCost: parseFloat(escrowData.estimatedCost),
        actualCost: actualCost
      });

      return {
        success: true,
        refundAmount: refundAmount > 0 ? refundAmount.toFixed(6) : undefined
      };
    } catch (error) {
      console.error('[EscrowService] Release escrow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cancel escrow and refund all funds
   */
  async cancelEscrow(escrowId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const escrowData = await this.getEscrowData(escrowId);
      if (!escrowData) {
        return { success: false, error: 'Escrow not found' };
      }

      if (escrowData.status !== 'active') {
        return { success: false, error: `Escrow is already ${escrowData.status}` };
      }

      // Refund full amount to client agent
      const refundResult = await this.refundFunds(
        escrowData.fromAgentId,
        escrowData.lockedAmount,
        escrowId
      );

      if (!refundResult.success) {
        return { success: false, error: `Failed to refund: ${refundResult.error}` };
      }

      // Update escrow status
      escrowData.status = 'refunded';
      escrowData.cancelledAt = new Date().toISOString();
      escrowData.cancelReason = reason;

      await this.env.ESCROW_STORE.put(
        `escrow:${escrowId}`,
        JSON.stringify(escrowData)
      );

      return { success: true };
    } catch (error) {
      console.error('[EscrowService] Cancel escrow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get escrow details
   */
  async getEscrow(escrowId: string): Promise<EscrowResult | null> {
    const data = await this.getEscrowData(escrowId);
    if (!data) return null;

    return {
      escrowId: data.escrowId,
      lockedAmount: data.lockedAmount,
      estimatedCost: data.estimatedCost,
      bufferAmount: data.bufferAmount,
      expiresAt: data.expiresAt,
      status: data.status
    };
  }

  // Private helper methods
  private async getEscrowData(escrowId: string): Promise<any> {
    const data = await this.env.ESCROW_STORE.get(`escrow:${escrowId}`);
    return data ? JSON.parse(data) : null;
  }

  private async lockFunds(agentId: string, amount: string, escrowId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const agentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(agentId));
      const response = await agentState.fetch(
        new Request(`${this.env.API_BASE_URL}/api/v1/agents/${agentId}/wallet/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            to_address: `escrow_${escrowId}`,
            transaction_id: generateTransactionId()
          })
        })
      );

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Unknown error' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async releaseFunds(agentId: string, amount: string, escrowId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const agentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(agentId));
      const response = await agentState.fetch(
        new Request(`${this.env.API_BASE_URL}/api/v1/agents/${agentId}/wallet/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            transaction_hash: generateTransactionId()
          })
        })
      );

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Unknown error' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async refundFunds(agentId: string, amount: string, escrowId: string): Promise<{ success: boolean; error?: string }> {
    return this.releaseFunds(agentId, amount, escrowId);
  }

  private async logTokenUsage(usage: {
    agentId: string;
    model: string;
    estimatedTokens: number;
    actualTokens: number;
    estimatedCost: number;
    actualCost: number;
  }): Promise<void> {
    try {
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        INSERT INTO token_usage (
          agent_id, model, estimated_tokens, actual_tokens,
          estimated_cost, actual_cost, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      await stmt.bind(
        usage.agentId,
        usage.model,
        usage.estimatedTokens,
        usage.actualTokens,
        usage.estimatedCost.toFixed(6),
        usage.actualCost.toFixed(6),
        new Date().toISOString()
      ).run();
    } catch (error) {
      console.error('[EscrowService] Failed to log token usage:', error);
    }
  }
}