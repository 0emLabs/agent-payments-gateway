import { ModelPricing, ModelType } from "@0emlabs/agent-payments-types";

export const modelPricing: ModelPricing[] = [
  {
    model: 'gpt-3.5-turbo',
    promptCostPer1k: 0.0005,
    completionCostPer1k: 0.0015,
    currency: 'USD',
  },
  {
    model: 'gpt-4',
    promptCostPer1k: 0.03,
    completionCostPer1k: 0.06,
    currency: 'USD',
  },
  {
    model: 'gpt-4-turbo',
    promptCostPer1k: 0.01,
    completionCostPer1k: 0.03,
    currency: 'USD',
  },
  {
    model: 'claude-2',
    promptCostPer1k: 0.008,
    completionCostPer1k: 0.024,
    currency: 'USD',
  },
  {
    model: 'claude-3-opus',
    promptCostPer1k: 0.015,
    completionCostPer1k: 0.075,
    currency: 'USD',
  },
  {
    model: 'claude-3-sonnet',
    promptCostPer1k: 0.003,
    completionCostPer1k: 0.015,
    currency: 'USD',
  },
  {
    model: 'claude-3-haiku',
    promptCostPer1k: 0.00025,
    completionCostPer1k: 0.00125,
    currency: 'USD',
  },
  {
    model: 'gemini-pro',
    promptCostPer1k: 0.000125,
    completionCostPer1k: 0.000375,
    currency: 'USD',
  },
  {
    model: 'gemini-ultra',
    promptCostPer1k: 0.000250,
    completionCostPer1k: 0.000750,
    currency: 'USD',
  },
  {
    model: 'llama-2-70b',
    promptCostPer1k: 0.00075,
    completionCostPer1k: 0.00075,
    currency: 'USD',
  },
  {
    model: 'mixtral-8x7b',
    promptCostPer1k: 0.0004,
    completionCostPer1k: 0.0004,
    currency: 'USD',
  },
];

export function getModelPricing(model: ModelType): ModelPricing | undefined {
  return modelPricing.find((p) => p.model === model);
}
