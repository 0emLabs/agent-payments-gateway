"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AgentPaymentsSDK: () => AgentPaymentsSDK
});
module.exports = __toCommonJS(index_exports);

// src/tokenCounter/index.ts
var ClientTokenCounter = class {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.pricingCache = /* @__PURE__ */ new Map();
  }
  /**
   * Estimates the number of tokens in a given text for a specific model.
   * This is a simplified, character-based estimate. For precise counting, integrate a proper tokenization library.
   * @param text The input text.
   * @param model The LLM model to estimate tokens for.
   * @returns The estimated number of tokens.
   */
  estimateTokens(text, model) {
    return Math.ceil(text.length / 4);
  }
  /**
   * Fetches model pricing details from the API, caching them for subsequent requests.
   * @param model Optional. The specific model to get pricing for. If not provided, returns all pricing.
   * @returns A promise that resolves to the pricing details.
   */
  async getModelPricing(model) {
    if (model && this.pricingCache.has(model)) {
      return this.pricingCache.get(model);
    }
    const url = model ? `${this.baseUrl}/api/v1/token-counter/pricing?model=${model}` : `${this.baseUrl}/api/v1/token-counter/pricing`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch model pricing: ${response.statusText}`);
    }
    const data = await response.json();
    if (model && data) {
      this.pricingCache.set(model, data);
      return data;
    } else if (!model && Array.isArray(data)) {
      data.forEach((p) => this.pricingCache.set(p.model, p));
      return data;
    }
    return void 0;
  }
  /**
   * Counts tokens and estimates cost using the backend API.
   * @param text The input text.
   * @param model The LLM model.
   * @returns A promise that resolves to the token count and estimated cost.
   */
  async countAndEstimateCost(text, model) {
    const response = await fetch(`${this.baseUrl}/api/v1/token-counter/count`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text, model })
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to count tokens and estimate cost");
    }
    return response.json();
  }
};

// src/index.ts
var AgentPaymentsSDK = class {
  constructor(config) {
    this.tokenCounter = new ClientTokenCounter(config.baseUrl);
  }
  // Add more SDK methods here later, e.g., for agent management, task management, etc.
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentPaymentsSDK
});
