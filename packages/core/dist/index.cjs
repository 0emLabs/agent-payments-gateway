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
  AgentRegistry: () => AgentRegistry,
  TaskOrchestrator: () => TaskOrchestrator,
  createApp: () => createApp,
  generateApiKey: () => generateApiKey,
  generateTaskId: () => generateTaskId,
  generateTransactionId: () => generateTransactionId,
  hashApiKey: () => hashApiKey,
  verifyWebhookSignature: () => verifyWebhookSignature
});
module.exports = __toCommonJS(index_exports);
var import_hono = require("hono");
var import_cors = require("hono/cors");

// src/utils/crypto.ts
function generateApiKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "sk_live_" + Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hashApiKey(apiKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function generateTaskId() {
  return "task_" + crypto.randomUUID().replace(/-/g, "");
}
function generateTransactionId() {
  return "tx_" + crypto.randomUUID().replace(/-/g, "");
}
async function verifyWebhookSignature(body, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signatureBytes = hexToBytes(signature);
  const dataBytes = encoder.encode(body);
  return crypto.subtle.verify("HMAC", key, signatureBytes, dataBytes);
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// src/registry/AgentRegistry.ts
var AgentRegistry = class {
  constructor(env) {
    this.env = env;
  }
  async createAgent(params) {
    const agentId = crypto.randomUUID();
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    await this.env.MARKETPLACE_DB.prepare(`
      INSERT INTO agents (id, name, owner_id, api_key_hash, reputation_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      agentId,
      params.name,
      params.ownerId,
      apiKeyHash,
      5,
      // Default reputation
      (/* @__PURE__ */ new Date()).toISOString(),
      (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    const doId = this.env.AGENT_STATE.idFromString(agentId);
    const stub = this.env.AGENT_STATE.get(doId);
    await stub.fetch(new Request("http://do/register", {
      method: "POST",
      body: JSON.stringify({
        id: agentId,
        name: params.name,
        owner: params.ownerId,
        description: params.description,
        tags: params.tags
      })
    }));
    return {
      agent: {
        id: agentId,
        name: params.name,
        ownerId: params.ownerId,
        reputationScore: 5,
        createdAt: /* @__PURE__ */ new Date()
      },
      apiKey
      // Return only once, user must save it
    };
  }
  async getAgent(agentId) {
    const result = await this.env.MARKETPLACE_DB.prepare(`
      SELECT id, name, owner_id, reputation_score, created_at
      FROM agents
      WHERE id = ?
    `).bind(agentId).first();
    if (!result) return null;
    return {
      id: result.id,
      name: result.name,
      ownerId: result.owner_id,
      reputationScore: result.reputation_score,
      createdAt: new Date(result.created_at)
    };
  }
  async validateApiKey(apiKey) {
    const hash = await hashApiKey(apiKey);
    const result = await this.env.MARKETPLACE_DB.prepare(`
      SELECT id, name, owner_id, reputation_score, created_at
      FROM agents
      WHERE api_key_hash = ?
    `).bind(hash).first();
    if (!result) return null;
    return {
      id: result.id,
      name: result.name,
      ownerId: result.owner_id,
      reputationScore: result.reputation_score,
      createdAt: new Date(result.created_at)
    };
  }
  async updateAgentReputation(agentId, newScore) {
    await this.env.MARKETPLACE_DB.prepare(`
      UPDATE agents 
      SET reputation_score = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      Math.max(0, Math.min(10, newScore)),
      // Clamp between 0-10
      (/* @__PURE__ */ new Date()).toISOString(),
      agentId
    ).run();
  }
  async listAgents(params) {
    const limit = params.limit || 20;
    const offset = params.offset || 0;
    let query = `
      SELECT id, name, owner_id, reputation_score, created_at
      FROM agents
      WHERE 1=1
    `;
    const bindings = [];
    if (params.search) {
      query += ` AND (name LIKE ? OR id LIKE ?)`;
      bindings.push(`%${params.search}%`, `%${params.search}%`);
    }
    query += ` ORDER BY reputation_score DESC, created_at DESC LIMIT ? OFFSET ?`;
    bindings.push(limit, offset);
    const results = await this.env.MARKETPLACE_DB.prepare(query).bind(...bindings).all();
    const agents = results.results?.map((row) => ({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      reputationScore: row.reputation_score,
      createdAt: new Date(row.created_at)
    })) || [];
    const countQuery = params.search ? `SELECT COUNT(*) as total FROM agents WHERE name LIKE ? OR id LIKE ?` : `SELECT COUNT(*) as total FROM agents`;
    const countBindings = params.search ? [`%${params.search}%`, `%${params.search}%`] : [];
    const countResult = await this.env.MARKETPLACE_DB.prepare(countQuery).bind(...countBindings).first();
    return {
      agents,
      total: countResult?.total || 0
    };
  }
};

// src/tasks/TaskOrchestrator.ts
var TaskOrchestrator = class {
  constructor(env) {
    this.env = env;
  }
  async createTask(params) {
    const taskId = generateTaskId();
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    const response = await orchestrator.fetch(new Request("http://do/create", {
      method: "POST",
      body: JSON.stringify({
        client_agent_id: params.fromAgentId,
        tool_agent_id: params.toAgentId,
        task_details: params.payload,
        payment_offer: params.payment
      })
    }));
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || "Failed to create task");
    }
    const result = await response.json();
    return {
      id: result.task_id,
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      status: "pending",
      payload: params.payload,
      payment: params.payment,
      createdAt: /* @__PURE__ */ new Date(),
      expiresAt: new Date(result.expires_at)
    };
  }
  async getTaskStatus(taskId) {
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    const response = await orchestrator.fetch(new Request("http://do/status", {
      method: "GET"
    }));
    if (!response.ok) {
      return null;
    }
    const result = await response.json();
    return {
      id: result.task.id,
      fromAgentId: result.task.client_agent_id,
      toAgentId: result.task.tool_agent_id,
      status: result.status,
      // Use status from the top-level of the result
      payload: result.task.task_details,
      payment: result.task.payment_offer,
      createdAt: new Date(result.task.created_at),
      expiresAt: new Date(result.task.expires_at),
      completedAt: result.task.completed_at ? new Date(result.task.completed_at) : void 0
    };
  }
  async acceptTask(taskId, toolAgentId) {
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    const response = await orchestrator.fetch(new Request("http://do/accept", {
      method: "POST",
      body: JSON.stringify({ tool_agent_id: toolAgentId })
    }));
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || "Failed to accept task");
    }
  }
  async completeTask(taskId, toolAgentId, result) {
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    const response = await orchestrator.fetch(new Request("http://do/complete", {
      method: "POST",
      body: JSON.stringify({
        tool_agent_id: toolAgentId,
        result
      })
    }));
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || "Failed to complete task");
    }
  }
  async cancelTask(taskId, clientAgentId, reason) {
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    const response = await orchestrator.fetch(new Request("http://do/cancel", {
      method: "POST",
      body: JSON.stringify({
        client_agent_id: clientAgentId,
        reason
      })
    }));
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || "Failed to cancel task");
    }
  }
  async getAgentTasks(agentId, role = "client") {
    const column = role === "client" ? "client_agent_id" : "tool_agent_id";
    if (!this.env.MARKETPLACE_DB) {
      console.warn("MARKETPLACE_DB is not available for getAgentTasks.");
      return [];
    }
    const results = await this.env.MARKETPLACE_DB.prepare(`
      SELECT task_id, client_agent_id, tool_agent_id, status, created_at, completed_at
      FROM transaction_logs
      WHERE ${column} = ? AND action = 'created'
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(agentId).all();
    const tasks = [];
    for (const log of results.results || []) {
      const taskDetails = log;
      const task = await this.getTaskStatus(taskDetails.task_id);
      if (task) {
        tasks.push(task);
      }
    }
    return tasks;
  }
};

// src/tokenCounter/pricing.ts
var modelPricing = [
  { model: "gpt-3.5-turbo", promptCostPer1k: 5e-4, completionCostPer1k: 15e-4, currency: "USD" },
  { model: "gpt-4", promptCostPer1k: 0.03, completionCostPer1k: 0.06, currency: "USD" },
  { model: "gpt-4-turbo", promptCostPer1k: 0.01, completionCostPer1k: 0.03, currency: "USD" },
  { model: "claude-2", promptCostPer1k: 8e-3, completionCostPer1k: 0.024, currency: "USD" },
  { model: "claude-3-opus", promptCostPer1k: 0.05, completionCostPer1k: 0.15, currency: "USD" },
  { model: "claude-3-sonnet", promptCostPer1k: 0.03, completionCostPer1k: 0.06, currency: "USD" },
  { model: "claude-3-haiku", promptCostPer1k: 25e-4, completionCostPer1k: 0.0125, currency: "USD" },
  { model: "gemini-pro", promptCostPer1k: 1e-4, completionCostPer1k: 2e-4, currency: "USD" },
  { model: "gemini-ultra", promptCostPer1k: 2e-3, completionCostPer1k: 4e-3, currency: "USD" },
  { model: "llama-2-70b", promptCostPer1k: 75e-5, completionCostPer1k: 1e-3, currency: "USD" },
  { model: "mixtral-8x7b", promptCostPer1k: 4e-4, completionCostPer1k: 6e-4, currency: "USD" }
];
function getModelPricing(model) {
  return modelPricing.find((p) => p.model === model);
}

// src/tokenCounter/index.ts
var UniversalTokenCounter = class {
  // Simple in-memory cache for demonstration
  constructor() {
    this.tokenizers = /* @__PURE__ */ new Map();
    this.cache = /* @__PURE__ */ new Map();
  }
  // A simplified token counting function. In a real scenario, this would be model-specific.
  getTokenizer(model) {
    switch (model) {
      case "gpt-3.5-turbo":
      case "gpt-4":
      case "gpt-4-turbo":
        return (text) => Math.ceil(text.length / 4);
      case "claude-2":
      case "claude-3-opus":
      case "claude-3-sonnet":
      case "claude-3-haiku":
        return (text) => Math.ceil(text.length / 3.5);
      case "gemini-pro":
      case "gemini-ultra":
        return (text) => Math.ceil(text.length / 4.2);
      case "llama-2-70b":
      case "mixtral-8x7b":
        return (text) => Math.ceil(text.length / 3.8);
      default:
        return (text) => Math.ceil(text.length / 4);
    }
  }
  async countTokens(text, model) {
    const cacheKey = `${model}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    const tokenizer = this.getTokenizer(model);
    const count = tokenizer(text);
    this.cache.set(cacheKey, count);
    return count;
  }
  async estimateCost(tokens, model, isCompletion = false) {
    const pricing = getModelPricing(model);
    if (!pricing) {
      throw new Error(`Pricing not found for model: ${model}`);
    }
    const costPer1k = isCompletion ? pricing.completionCostPer1k : pricing.promptCostPer1k;
    return tokens / 1e3 * costPer1k;
  }
  async getModelPricingDetails(model) {
    return getModelPricing(model);
  }
};

// src/index.ts
function createApp() {
  const app = new import_hono.Hono();
  app.use("*", (0, import_cors.cors)());
  const tokenCounter = new UniversalTokenCounter();
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/api/v1/agents", async (c) => {
    const { name, description, tags } = await c.req.json();
    const ownerId = c.req.header("X-User-Id");
    if (!ownerId) {
      return c.json({ error: "Unauthorized - X-User-Id header required" }, 401);
    }
    if (!name) {
      return c.json({ error: "Agent name is required" }, 400);
    }
    const registry = new AgentRegistry(c.env);
    try {
      const result = await registry.createAgent({
        name,
        ownerId,
        description,
        tags
      });
      return c.json(result, 201);
    } catch (error) {
      console.error("Failed to create agent:", error);
      return c.json({
        error: "Failed to create agent",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  });
  app.get("/api/v1/agents/:id", async (c) => {
    const agentId = c.req.param("id");
    const registry = new AgentRegistry(c.env);
    const agent = await registry.getAgent(agentId);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }
    return c.json(agent);
  });
  app.get("/api/v1/agents", async (c) => {
    const search = c.req.query("search");
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");
    const registry = new AgentRegistry(c.env);
    const result = await registry.listAgents({ search, limit, offset });
    return c.json(result);
  });
  app.get("/api/v1/agents/:id/wallet", async (c) => {
    const agentId = c.req.param("id");
    const doId = c.env.AGENT_STATE.idFromString(agentId);
    const stub = c.env.AGENT_STATE.get(doId);
    const response = await stub.fetch(new Request("http://do/balance"));
    if (!response.ok) {
      return c.json({ error: "Failed to get wallet balance" }, 500);
    }
    const balance = await response.json();
    return c.json(balance);
  });
  app.post("/api/v1/tasks", async (c) => {
    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) {
      return c.json({ error: "API key required" }, 401);
    }
    const registry = new AgentRegistry(c.env);
    const fromAgent = await registry.validateApiKey(apiKey);
    if (!fromAgent) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    const { toAgentId, payload, payment } = await c.req.json();
    if (!toAgentId || !payload || !payment) {
      return c.json({
        error: "Missing required fields: toAgentId, payload, payment"
      }, 400);
    }
    const orchestrator = new TaskOrchestrator(c.env);
    try {
      const task = await orchestrator.createTask({
        fromAgentId: fromAgent.id,
        toAgentId,
        toolAgentId: toAgentId,
        // Added toolAgentId
        payload,
        payment
      });
      return c.json(task, 201);
    } catch (error) {
      console.error("Failed to create task:", error);
      return c.json({
        error: "Failed to create task",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  });
  app.get("/api/v1/tasks/:id", async (c) => {
    const taskId = c.req.param("id");
    const orchestrator = new TaskOrchestrator(c.env);
    const task = await orchestrator.getTaskStatus(taskId);
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }
    return c.json(task);
  });
  app.post("/api/v1/tasks/:id/accept", async (c) => {
    const taskId = c.req.param("id");
    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) {
      return c.json({ error: "API key required" }, 401);
    }
    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    const orchestrator = new TaskOrchestrator(c.env);
    try {
      await orchestrator.acceptTask(taskId, agent.id);
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to accept task:", error);
      return c.json({
        error: "Failed to accept task",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  });
  app.post("/api/v1/tasks/:id/complete", async (c) => {
    const taskId = c.req.param("id");
    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) {
      return c.json({ error: "API key required" }, 401);
    }
    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    const { result } = await c.req.json();
    const orchestrator = new TaskOrchestrator(c.env);
    try {
      await orchestrator.completeTask(taskId, agent.id, result);
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to complete task:", error);
      return c.json({
        error: "Failed to complete task",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  });
  app.post("/api/v1/tasks/:id/cancel", async (c) => {
    const taskId = c.req.param("id");
    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) {
      return c.json({ error: "API key required" }, 401);
    }
    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: "Invalid API key" }, 401);
    }
    const { reason } = await c.req.json();
    const orchestrator = new TaskOrchestrator(c.env);
    try {
      await orchestrator.cancelTask(taskId, agent.id, reason);
      return c.json({ success: true });
    } catch (error) {
      console.error("Failed to cancel task:", error);
      return c.json({
        error: "Failed to cancel task",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  });
  app.get("/api/v1/agents/:id/tasks", async (c) => {
    const agentId = c.req.param("id");
    const role = c.req.query("role") || "client";
    const orchestrator = new TaskOrchestrator(c.env);
    const tasks = await orchestrator.getAgentTasks(agentId, role);
    return c.json({ tasks });
  });
  app.post("/api/v1/token-counter/count", async (c) => {
    const { text, model } = await c.req.json();
    if (!text || !model) {
      return c.json({ error: "Missing text or model" }, 400);
    }
    try {
      const count = await tokenCounter.countTokens(text, model);
      const cost = await tokenCounter.estimateCost(count, model, false);
      return c.json({ tokens: count, estimatedCost: cost });
    } catch (error) {
      return c.json({ error: error.message }, 500);
    }
  });
  app.get("/api/v1/token-counter/pricing", async (c) => {
    const model = c.req.query("model");
    if (model) {
      const pricing = await tokenCounter.getModelPricingDetails(model);
      if (pricing) {
        return c.json(pricing);
      } else {
        return c.json({ error: "Pricing not found for model" }, 404);
      }
    }
    return c.json(modelPricing);
  });
  return app;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AgentRegistry,
  TaskOrchestrator,
  createApp,
  generateApiKey,
  generateTaskId,
  generateTransactionId,
  hashApiKey,
  verifyWebhookSignature
});
