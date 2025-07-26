import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type Env } from '../shared/middleware';
import { AgentService } from '@agent-payments/core';

const agentsRouter = new Hono<{ Bindings: Env }>();

// Schemas
const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  wallet: z.object({
    type: z.enum(['custodial', 'smart-wallet']).default('custodial'),
    chain: z.enum(['base', 'polygon', 'ethereum']).default('base')
  }).optional()
});

const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional()
});

// Initialize service
const getAgentService = (c: Context<{ Bindings: Env }>) => {
  return new AgentService({
    kvNamespace: c.env.AUTH_STORE,
    durableObjectNamespace: c.env.AGENT_STATE
  });
};

// Create a new agent
agentsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = CreateAgentSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const agentService = getAgentService(c);
  
  try {
    // Create agent with auto-provisioned wallet
    const agent = await agentService.createAgent({
      ...parseResult.data,
      createdBy: c.req.header('X-User-ID') || 'system'
    });

    // If smart wallet requested, provision it
    if (parseResult.data.wallet?.type === 'smart-wallet') {
      // This will be implemented with Alchemy Account Kit
      agent.wallet = {
        ...agent.wallet,
        type: 'smart-wallet',
        smartContractAddress: 'pending'
      };
    }

    return c.json({
      success: true,
      agent
    }, 201);
  } catch (error) {
    console.error('Create agent error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create agent'
    });
  }
});

// Get agent by ID
agentsRouter.get('/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const agentService = getAgentService(c);
  
  try {
    const agent = await agentService.getAgent(agentId);
    
    if (!agent) {
      throw new HTTPException(404, {
        message: 'Agent not found'
      });
    }

    return c.json({
      success: true,
      agent
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get agent error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get agent'
    });
  }
});

// Update agent
agentsRouter.put('/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const body = await c.req.json();
  const parseResult = UpdateAgentSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const agentService = getAgentService(c);
  
  try {
    const agent = await agentService.updateAgent(agentId, parseResult.data);
    
    if (!agent) {
      throw new HTTPException(404, {
        message: 'Agent not found'
      });
    }

    return c.json({
      success: true,
      agent
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Update agent error:', error);
    throw new HTTPException(500, {
      message: 'Failed to update agent'
    });
  }
});

// Get agent wallet
agentsRouter.get('/:agentId/wallet', async (c) => {
  const agentId = c.req.param('agentId');
  const agentService = getAgentService(c);
  
  try {
    const wallet = await agentService.getAgentWallet(agentId);
    
    if (!wallet) {
      throw new HTTPException(404, {
        message: 'Agent wallet not found'
      });
    }

    // Get current balance
    const balance = await agentService.getWalletBalance(agentId);

    return c.json({
      success: true,
      wallet: {
        ...wallet,
        balance
      }
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get wallet error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get agent wallet'
    });
  }
});

// List agents
agentsRouter.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  const status = c.req.query('status');
  const createdBy = c.req.query('created_by');
  
  const agentService = getAgentService(c);
  
  try {
    const result = await agentService.listAgents({
      limit,
      offset,
      filters: {
        status,
        createdBy
      }
    });

    return c.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('List agents error:', error);
    throw new HTTPException(500, {
      message: 'Failed to list agents'
    });
  }
});

// Delete agent (soft delete)
agentsRouter.delete('/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const agentService = getAgentService(c);
  
  try {
    const success = await agentService.deleteAgent(agentId);
    
    if (!success) {
      throw new HTTPException(404, {
        message: 'Agent not found'
      });
    }

    return c.json({
      success: true,
      message: 'Agent deleted successfully'
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Delete agent error:', error);
    throw new HTTPException(500, {
      message: 'Failed to delete agent'
    });
  }
});

export { agentsRouter };