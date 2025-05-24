import { Env } from '../types/env';
import { ModelType } from '@0emlabs/agent-payments-types';

export interface TokenEstimation {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  escrowAmount: number;
  model: string;
  pricingSource: string;
}

export interface TokenUsageResult {
  requestId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  processingTimeMs: number;
  cacheHit: boolean;
  pricingSource: string;
}

export class TokenCounterService {
  private utcApiUrl: string;
  private apiKey: string;
  private bufferPercentage: number;

  constructor(env: Env) {
    this.utcApiUrl = env.UTC_SERVICE_URL || 'http://localhost:8000';
    this.apiKey = env.UTC_API_KEY || '';
    this.bufferPercentage = parseInt(env.ESCROW_BUFFER_PERCENTAGE || '15');
  }

  /**
   * Estimate token usage and cost for a task
   */
  async estimateTaskCost(params: {
    text: string;
    model: ModelType | string;
    agentId: string;
  }): Promise<TokenEstimation> {
    try {
      const response = await fetch(`${this.utcApiUrl}/api/v1/tokens/count`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Agent-ID': params.agentId
        },
        body: JSON.stringify({
          text: params.text,
          model: params.model,
          user_id: params.agentId,
          use_cache: true
        })
      });

      if (!response.ok) {
        throw new Error(`Token counting failed: ${response.status}`);
      }

      const usage: TokenUsageResult = await response.json();

      // Estimate output tokens (rough approximation)
      // This should be refined based on historical data
      const estimatedOutputTokens = Math.floor(usage.inputTokens * 0.8);
      
      // Calculate estimated total cost
      const outputCostRatio = 2; // Output tokens typically cost 2x input
      const estimatedOutputCost = (estimatedOutputTokens / 1_000_000) * (usage.cost / usage.inputTokens * 1_000_000) * outputCostRatio;
      const estimatedTotalCost = usage.cost + estimatedOutputCost;

      // Calculate escrow amount with buffer
      const escrowAmount = estimatedTotalCost * (1 + this.bufferPercentage / 100);

      return {
        estimatedInputTokens: usage.inputTokens,
        estimatedOutputTokens,
        estimatedCost: estimatedTotalCost,
        escrowAmount,
        model: params.model,
        pricingSource: usage.pricingSource
      };
    } catch (error) {
      console.error('Token estimation failed:', error);
      throw new Error(`Failed to estimate token cost: ${error.message}`);
    }
  }

  /**
   * Count tokens for a batch of requests
   */
  async batchCountTokens(requests: Array<{
    text: string;
    model: string;
    agentId: string;
  }>): Promise<TokenUsageResult[]> {
    try {
      const response = await fetch(`${this.utcApiUrl}/api/v1/tokens/count/batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: requests.map(req => ({
            text: req.text,
            model: req.model,
            user_id: req.agentId
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`Batch token counting failed: ${response.status}`);
      }

      const result = await response.json();
      return result.results;
    } catch (error) {
      console.error('Batch token counting failed:', error);
      throw error;
    }
  }

  /**
   * Get token usage statistics for an agent
   */
  async getUsageStats(agentId: string, hours: number = 24): Promise<any> {
    try {
      const response = await fetch(
        `${this.utcApiUrl}/api/v1/stats?user_id=${agentId}&hours=${hours}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get usage stats: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get usage stats:', error);
      throw error;
    }
  }

  /**
   * Get supported models and their pricing
   */
  async getSupportedModels(): Promise<any> {
    try {
      const response = await fetch(`${this.utcApiUrl}/api/v1/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get supported models: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get supported models:', error);
      throw error;
    }
  }

  /**
   * Get current pricing for all models
   */
  async getPricing(): Promise<any> {
    try {
      const response = await fetch(`${this.utcApiUrl}/api/v1/pricing`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get pricing: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get pricing:', error);
      throw error;
    }
  }

  /**
   * Calculate actual cost after task completion
   */
  calculateActualCost(params: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    pricePerMillionInput: number;
    pricePerMillionOutput: number;
  }): number {
    const inputCost = (params.inputTokens / 1_000_000) * params.pricePerMillionInput;
    const outputCost = (params.outputTokens / 1_000_000) * params.pricePerMillionOutput;
    return inputCost + outputCost;
  }

  /**
   * Calculate refund amount from escrow
   */
  calculateRefund(escrowAmount: number, actualCost: number): number {
    const refund = escrowAmount - actualCost;
    return refund > 0 ? refund : 0;
  }
}

// Export for use in other services
export { ModelType } from '@0emlabs/agent-payments-types';