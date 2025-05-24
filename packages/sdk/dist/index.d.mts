import { ModelType, ModelPricing } from '@0emlabs/agent-payments-types';

declare class ClientTokenCounter {
    private baseUrl;
    private pricingCache;
    constructor(baseUrl: string);
    /**
     * Estimates the number of tokens in a given text for a specific model.
     * This is a simplified, character-based estimate. For precise counting, integrate a proper tokenization library.
     * @param text The input text.
     * @param model The LLM model to estimate tokens for.
     * @returns The estimated number of tokens.
     */
    estimateTokens(text: string, model: ModelType): number;
    /**
     * Fetches model pricing details from the API, caching them for subsequent requests.
     * @param model Optional. The specific model to get pricing for. If not provided, returns all pricing.
     * @returns A promise that resolves to the pricing details.
     */
    getModelPricing(model?: ModelType): Promise<ModelPricing | ModelPricing[] | undefined>;
    /**
     * Counts tokens and estimates cost using the backend API.
     * @param text The input text.
     * @param model The LLM model.
     * @returns A promise that resolves to the token count and estimated cost.
     */
    countAndEstimateCost(text: string, model: ModelType): Promise<{
        tokens: number;
        estimatedCost: number;
    }>;
}

interface AgentPaymentsSDKConfig {
    baseUrl: string;
}
declare class AgentPaymentsSDK {
    tokenCounter: ClientTokenCounter;
    constructor(config: AgentPaymentsSDKConfig);
}

export { AgentPaymentsSDK };
