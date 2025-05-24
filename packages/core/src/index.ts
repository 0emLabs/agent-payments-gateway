import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AgentRegistry } from './registry/AgentRegistry';
import { TaskOrchestrator } from './tasks/TaskOrchestrator';
import { Env } from './types/env';
import { TokenCounterService } from './tokenCounter/TokenCounterService';
import { WalletService } from './wallet/WalletService';
import { ModelType } from '@0emlabs/agent-payments-types';
import { AgentStateDO } from './agents/AgentStateDO';
import { TransactionOrchestratorDO } from './transactions/TransactionOrchestratorDO';
import { ToolRegistryDO } from './durable-objects/ToolRegistryDO';
import { RateLimiterDO } from './durable-objects/RateLimiterDO';

// Export types
export * from './types/agent';
export * from './types/task';
export * from './types/env';

// Export services
export { AgentRegistry } from './registry/AgentRegistry';
export { TaskOrchestrator } from './tasks/TaskOrchestrator';
export { TokenCounterService } from './tokenCounter/TokenCounterService';
export { EscrowService } from './escrow/EscrowService';
export { WalletService } from './wallet/WalletService';

// Export utils
export * from './utils/crypto';

// Create the main API application
export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  // Middleware
  app.use('*', cors());

  // Token counter will be initialized per request with env

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Agent endpoints
  app.post('/api/v1/agents', async (c) => {
    const { name, description, tags } = await c.req.json();
    const ownerId = c.req.header('X-User-Id');

    if (!ownerId) {
      return c.json({ error: 'Unauthorized - X-User-Id header required' }, 401);
    }

    if (!name) {
      return c.json({ error: 'Agent name is required' }, 400);
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
      console.error('Failed to create agent:', error);
      return c.json({
        error: 'Failed to create agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  app.get('/api/v1/agents/:id', async (c) => {
    const agentId = c.req.param('id');
    const registry = new AgentRegistry(c.env);
    const agent = await registry.getAgent(agentId);

    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    return c.json(agent);
  });

  app.get('/api/v1/agents', async (c) => {
    const search = c.req.query('search');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const registry = new AgentRegistry(c.env);
    const result = await registry.listAgents({ search, limit, offset });

    return c.json(result);
  });

  // Wallet endpoints
  app.get('/api/v1/agents/:id/wallet', async (c) => {
    const agentId = c.req.param('id');

    // Get balance from Durable Object
    const doId = c.env.AGENT_STATE.idFromString(agentId);
    const stub = c.env.AGENT_STATE.get(doId);

    const response = await stub.fetch(new Request('http://do/balance'));

    if (!response.ok) {
      return c.json({ error: 'Failed to get wallet balance' }, 500);
    }

    const balance = await response.json();
    return c.json(balance);
  });

  // Task endpoints (A2A payments)
  app.post('/api/v1/tasks', async (c) => {
    const apiKey = c.req.header('X-API-Key');
    if (!apiKey) {
      return c.json({ error: 'API key required' }, 401);
    }

    // Validate API key
    const registry = new AgentRegistry(c.env);
    const fromAgent = await registry.validateApiKey(apiKey);
    if (!fromAgent) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const { toAgentId, payload, payment } = await c.req.json();

    if (!toAgentId || !payload || !payment) {
      return c.json({
        error: 'Missing required fields: toAgentId, payload, payment'
      }, 400);
    }

    // Create task with payment
    const orchestrator = new TaskOrchestrator(c.env);

    try {
      const task = await orchestrator.createTask({
        fromAgentId: fromAgent.id,
        toAgentId,
        toolAgentId: toAgentId, // Added toolAgentId
        payload,
        payment
      });

      return c.json(task, 201);
    } catch (error) {
      console.error('Failed to create task:', error);
      return c.json({
        error: 'Failed to create task',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  app.get('/api/v1/tasks/:id', async (c) => {
    const taskId = c.req.param('id');
    const orchestrator = new TaskOrchestrator(c.env);

    const task = await orchestrator.getTaskStatus(taskId);

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    return c.json(task);
  });

  app.post('/api/v1/tasks/:id/accept', async (c) => {
    const taskId = c.req.param('id');
    const apiKey = c.req.header('X-API-Key');

    if (!apiKey) {
      return c.json({ error: 'API key required' }, 401);
    }

    // Validate API key
    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const orchestrator = new TaskOrchestrator(c.env);

    try {
      await orchestrator.acceptTask(taskId, agent.id);
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to accept task:', error);
      return c.json({
        error: 'Failed to accept task',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  app.post('/api/v1/tasks/:id/complete', async (c) => {
    const taskId = c.req.param('id');
    const apiKey = c.req.header('X-API-Key');

    if (!apiKey) {
      return c.json({ error: 'API key required' }, 401);
    }

    // Validate API key
    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const { result } = await c.req.json();
    const orchestrator = new TaskOrchestrator(c.env);

    try {
      await orchestrator.completeTask(taskId, agent.id, result);
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to complete task:', error);
      return c.json({
        error: 'Failed to complete task',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  app.post('/api/v1/tasks/:id/cancel', async (c) => {
    const taskId = c.req.param('id');
    const apiKey = c.req.header('X-API-Key');

    if (!apiKey) {
      return c.json({ error: 'API key required' }, 401);
    }

    // Validate API key
    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const { reason } = await c.req.json();
    const orchestrator = new TaskOrchestrator(c.env);

    try {
      await orchestrator.cancelTask(taskId, agent.id, reason);
      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to cancel task:', error);
      return c.json({
        error: 'Failed to cancel task',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  // Agent tasks history
  app.get('/api/v1/agents/:id/tasks', async (c) => {
    const agentId = c.req.param('id');
    const role = c.req.query('role') as 'client' | 'tool' || 'client';

    const orchestrator = new TaskOrchestrator(c.env);
    const tasks = await orchestrator.getAgentTasks(agentId, role);

    return c.json({ tasks });
  });

  // Token Counter endpoints
  app.post('/api/v1/token-counter/estimate', async (c) => {
    const { text, model, agentId } = await c.req.json();
    if (!text || !model || !agentId) {
      return c.json({ error: 'Missing text, model, or agentId' }, 400);
    }
    
    const tokenCounter = new TokenCounterService(c.env);
    
    try {
      const estimation = await tokenCounter.estimateTaskCost({
        text,
        model,
        agentId
      });
      return c.json(estimation);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  app.get('/api/v1/token-counter/usage/:agentId', async (c) => {
    const agentId = c.req.param('agentId');
    const hours = parseInt(c.req.query('hours') || '24');
    
    const tokenCounter = new TokenCounterService(c.env);
    
    try {
      const stats = await tokenCounter.getUsageStats(agentId, hours);
      return c.json(stats);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  app.get('/api/v1/token-counter/models', async (c) => {
    const tokenCounter = new TokenCounterService(c.env);
    
    try {
      const models = await tokenCounter.getSupportedModels();
      return c.json(models);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });
  
  app.get('/api/v1/token-counter/pricing', async (c) => {
    const tokenCounter = new TokenCounterService(c.env);
    
    try {
      const pricing = await tokenCounter.getPricing();
      return c.json(pricing);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Escrow endpoints
  app.get('/api/v1/escrow/:id', async (c) => {
    const escrowId = c.req.param('id');
    const escrowService = new EscrowService(c.env);
    
    try {
      const escrow = await escrowService.getEscrow(escrowId);
      if (!escrow) {
        return c.json({ error: 'Escrow not found' }, 404);
      }
      return c.json(escrow);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Smart Wallet endpoints
  app.post('/api/v1/wallets/create', async (c) => {
    const apiKey = c.req.header('X-API-Key');
    if (!apiKey) {
      return c.json({ error: 'API key required' }, 401);
    }

    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const walletService = new WalletService(c.env);
    const { initialBalance, sessionKeyConfig } = await c.req.json();

    try {
      const wallet = await walletService.createSmartWallet({
        agentId: agent.id,
        initialBalance,
        sessionKeyConfig
      });
      return c.json(wallet, 201);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  app.get('/api/v1/wallets/:agentId/balance', async (c) => {
    const agentId = c.req.param('agentId');
    const walletService = new WalletService(c.env);

    try {
      const balance = await walletService.getBalance(agentId);
      return c.json(balance);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  app.post('/api/v1/wallets/transfer', async (c) => {
    const apiKey = c.req.header('X-API-Key');
    if (!apiKey) {
      return c.json({ error: 'API key required' }, 401);
    }

    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const { toAddress, amount, token = 'usdc' } = await c.req.json();
    const walletService = new WalletService(c.env);

    try {
      const txHash = await walletService.transfer(
        agent.id,
        toAddress,
        amount,
        token as 'native' | 'usdc'
      );
      return c.json({ transactionHash: txHash });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  app.post('/api/v1/wallets/session-key', async (c) => {
    const apiKey = c.req.header('X-API-Key');
    if (!apiKey) {
      return c.json({ error: 'API key required' }, 401);
    }

    const registry = new AgentRegistry(c.env);
    const agent = await registry.validateApiKey(apiKey);
    if (!agent) {
      return c.json({ error: 'Invalid API key' }, 401);
    }

    const { spendLimit, durationHours, allowedContracts } = await c.req.json();
    const walletService = new WalletService(c.env);

    try {
      // Get wallet first
      const wallet = await walletService.getBalance(agent.id);
      if (!wallet) {
        return c.json({ error: 'Wallet not found' }, 404);
      }

      const sessionKey = await walletService.createSessionKey(
        { walletId: agent.id, agentId: agent.id } as any, // Simplified
        { spendLimit, durationHours, allowedContracts }
      );
      
      return c.json(sessionKey, 201);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  return app;
}

// Export Durable Objects (temporarily commented out due to DTS build issues)
// export { AgentStateDO } from './agents/AgentStateDO';
// export { TransactionOrchestratorDO } from './transactions/TransactionOrchestratorDO';
// export { ToolRegistryDO } from './durable-objects/ToolRegistryDO';
// export { RateLimiterDO } from './durable-objects/RateLimiterDO';
