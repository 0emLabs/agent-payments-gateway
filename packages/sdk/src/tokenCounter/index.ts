import { ModelType, ModelPricing } from '@0emlabs/agent-payments-types';

export class ClientTokenCounter {
  private baseUrl: string;
  private pricingCache: Map<ModelType, ModelPricing>;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.pricingCache = new Map();
  }

  /**
   * Estimates the number of tokens in a given text for a specific model.
   * This is a simplified, character-based estimate. For precise counting, integrate a proper tokenization library.
   * @param text The input text.
   * @param model The LLM model to estimate tokens for.
   * @returns The estimated number of tokens.
   */
  estimateTokens(text: string, model: ModelType): number {
    // A very rough estimation: ~4 characters per token for English
    // In a real-world scenario, you'd use a tokenizer like @dqbd/tiktoken
    return Math.ceil(text.length / 4);
  }

  /**
   * Fetches model pricing details from the API, caching them for subsequent requests.
   * @param model Optional. The specific model to get pricing for. If not provided, returns all pricing.
   * @returns A promise that resolves to the pricing details.
   */
  async getModelPricing(model?: ModelType): Promise<ModelPricing | ModelPricing[] | undefined> {
    if (model && this.pricingCache.has(model)) {
      return this.pricingCache.get(model)!;
    }

    const url = model ? `${this.baseUrl}/api/v1/token-counter/pricing?model=${model}` : `${this.baseUrl}/api/v1/token-counter/pricing`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch model pricing: ${response.statusText}`);
    }

    const data = await response.json();

    if (model && data) {
      this.pricingCache.set(model, data as ModelPricing);
      return data as ModelPricing;
    } else if (!model && Array.isArray(data)) {
      data.forEach(p => this.pricingCache.set(p.model, p));
      return data as ModelPricing[];
    }
    return undefined;
  }

  /**
   * Counts tokens and estimates cost using the backend API.
   * @param text The input text.
   * @param model The LLM model.
   * @returns A promise that resolves to the token count and estimated cost.
   */
  async countAndEstimateCost(text: string, model: ModelType): Promise<{ tokens: number; estimatedCost: number }> {
    const response = await fetch(`${this.baseUrl}/api/v1/token-counter/count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, model }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to count tokens and estimate cost');
    }

    return response.json();
  }
}
