import { BaseService } from './BaseService';
import { TokenEstimation } from '../types';

export class TokenCounterService extends BaseService {
  /**
   * Estimate token usage and cost for a task
   */
  async estimate(params: {
    text: string;
    model: string;
    agentId: string;
  }): Promise<TokenEstimation> {
    return this.request<TokenEstimation>('POST', '/api/v1/token-counter/estimate', {
      body: params
    });
  }

  /**
   * Get usage statistics for an agent
   */
  async getUsageStats(
    agentId: string,
    hours: number = 24
  ): Promise<{
    totalTokens: number;
    totalCost: number;
    modelBreakdown: Record<string, {
      tokens: number;
      cost: number;
      count: number;
    }>;
    hourlyUsage: Array<{
      hour: string;
      tokens: number;
      cost: number;
    }>;
  }> {
    return this.request('GET', `/api/v1/token-counter/usage/${agentId}`, {
      queryParams: { hours: hours.toString() }
    });
  }

  /**
   * Get list of supported models
   */
  async getSupportedModels(): Promise<
    Array<{
      model: string;
      provider: string;
      inputPrice: number;
      outputPrice: number;
      contextWindow: number;
    }>
  > {
    return this.request('GET', '/api/v1/token-counter/models');
  }

  /**
   * Get current pricing information
   */
  async getPricing(): Promise<{
    models: Record<string, {
      inputPrice: number;
      outputPrice: number;
    }>;
    currency: string;
    lastUpdated: string;
  }> {
    return this.request('GET', '/api/v1/token-counter/pricing');
  }

  /**
   * Batch estimate multiple texts
   */
  async batchEstimate(
    requests: Array<{
      text: string;
      model: string;
      agentId: string;
    }>
  ): Promise<TokenEstimation[]> {
    return this.request<TokenEstimation[]>('POST', '/api/v1/token-counter/batch-estimate', {
      body: { requests }
    });
  }
}