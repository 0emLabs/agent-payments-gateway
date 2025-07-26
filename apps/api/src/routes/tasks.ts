import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type Env } from '../shared/middleware';

const tasksRouter = new Hono<{ Bindings: Env }>();

// Task execution schema (matches stripe-for-agents spec)
const ExecuteTaskSchema = z.object({
  from_agent_id: z.string(),
  to_agent_id: z.string(),
  tool_name: z.string(),
  parameters: z.record(z.string(), z.any()),
  payment: z.object({
    amount: z.number().positive(),
    currency: z.enum(['USDC', 'ETH']).default('USDC'),
    chain: z.enum(['base', 'polygon', 'ethereum']).default('base')
  }).optional(),
  options: z.object({
    timeout_ms: z.number().default(30000),
    retry_count: z.number().default(3),
    estimate_tokens: z.boolean().default(true),
    escrow_buffer_percent: z.number().min(0).max(50).default(15)
  }).optional()
});

const TaskStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']);

// Execute a task between agents
tasksRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = ExecuteTaskSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const { from_agent_id, to_agent_id, tool_name, parameters, payment, options } = parseResult.data;
  
  try {
    // Generate unique task ID
    const taskId = crypto.randomUUID();
    
    // Get TransactionOrchestrator Durable Object
    const orchestratorId = c.env.TRANSACTION_ORCHESTRATOR.idFromName(taskId);
    const orchestrator = c.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    
    // Initialize transaction with payment details
    const request = new Request('http://internal/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        taskId,
        fromAgentId: from_agent_id,
        toAgentId: to_agent_id,
        toolName: tool_name,
        parameters,
        payment,
        options
      })
    });
    
    const initResponse = await orchestrator.fetch(request);
    if (!initResponse.ok) {
      const error = await initResponse.json();
      throw new HTTPException(initResponse.status, {
        message: error.message || 'Failed to initialize task'
      });
    }
    
    // Start task execution
    const executeRequest = new Request('http://internal/execute', {
      method: 'POST'
    });
    
    const executeResponse = await orchestrator.fetch(executeRequest);
    const result = await executeResponse.json();
    
    return c.json({
      success: true,
      task: {
        id: taskId,
        status: result.status,
        from_agent_id,
        to_agent_id,
        tool_name,
        payment: result.payment,
        escrow: result.escrow,
        created_at: new Date().toISOString()
      }
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Task execution error:', error);
    throw new HTTPException(500, {
      message: 'Failed to execute task'
    });
  }
});

// Get task status
tasksRouter.get('/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  
  try {
    // Get TransactionOrchestrator DO
    const orchestratorId = c.env.TRANSACTION_ORCHESTRATOR.idFromName(taskId);
    const orchestrator = c.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    
    const request = new Request('http://internal/status', {
      method: 'GET'
    });
    
    const response = await orchestrator.fetch(request);
    if (!response.ok) {
      if (response.status === 404) {
        throw new HTTPException(404, {
          message: 'Task not found'
        });
      }
      throw new HTTPException(response.status, {
        message: 'Failed to get task status'
      });
    }
    
    const task = await response.json();
    
    return c.json({
      success: true,
      task
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get task error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get task'
    });
  }
});

// Cancel a task
tasksRouter.post('/:taskId/cancel', async (c) => {
  const taskId = c.req.param('taskId');
  const body = await c.req.json();
  const reason = body.reason || 'Cancelled by user';
  
  try {
    const orchestratorId = c.env.TRANSACTION_ORCHESTRATOR.idFromName(taskId);
    const orchestrator = c.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    
    const request = new Request('http://internal/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });
    
    const response = await orchestrator.fetch(request);
    if (!response.ok) {
      const error = await response.json();
      throw new HTTPException(response.status, {
        message: error.message || 'Failed to cancel task'
      });
    }
    
    const result = await response.json();
    
    return c.json({
      success: true,
      task: result
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Cancel task error:', error);
    throw new HTTPException(500, {
      message: 'Failed to cancel task'
    });
  }
});

// List tasks
tasksRouter.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  const status = c.req.query('status') as z.infer<typeof TaskStatusSchema> | undefined;
  const fromAgentId = c.req.query('from_agent_id');
  const toAgentId = c.req.query('to_agent_id');
  
  try {
    // For MVP, we'll store task metadata in KV
    // In production, this would query D1 database
    const prefix = 'task:';
    const list = await c.env.PAYMENT_SESSIONS.list({
      prefix,
      limit,
      cursor: offset > 0 ? String(offset) : undefined
    });
    
    const tasks = await Promise.all(
      list.keys.map(async (key) => {
        const task = await c.env.PAYMENT_SESSIONS.get(key.name, 'json');
        return task;
      })
    );
    
    // Filter tasks based on query parameters
    let filteredTasks = tasks.filter(Boolean);
    
    if (status) {
      filteredTasks = filteredTasks.filter(task => task.status === status);
    }
    if (fromAgentId) {
      filteredTasks = filteredTasks.filter(task => task.from_agent_id === fromAgentId);
    }
    if (toAgentId) {
      filteredTasks = filteredTasks.filter(task => task.to_agent_id === toAgentId);
    }
    
    return c.json({
      success: true,
      tasks: filteredTasks,
      pagination: {
        limit,
        offset,
        total: list.keys.length,
        has_more: list.list_complete === false
      }
    });
  } catch (error) {
    console.error('List tasks error:', error);
    throw new HTTPException(500, {
      message: 'Failed to list tasks'
    });
  }
});

// Get task result
tasksRouter.get('/:taskId/result', async (c) => {
  const taskId = c.req.param('taskId');
  
  try {
    const orchestratorId = c.env.TRANSACTION_ORCHESTRATOR.idFromName(taskId);
    const orchestrator = c.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);
    
    const request = new Request('http://internal/result', {
      method: 'GET'
    });
    
    const response = await orchestrator.fetch(request);
    if (!response.ok) {
      if (response.status === 404) {
        throw new HTTPException(404, {
          message: 'Task result not found'
        });
      }
      throw new HTTPException(response.status, {
        message: 'Failed to get task result'
      });
    }
    
    const result = await response.json();
    
    return c.json({
      success: true,
      result
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get task result error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get task result'
    });
  }
});

export { tasksRouter };