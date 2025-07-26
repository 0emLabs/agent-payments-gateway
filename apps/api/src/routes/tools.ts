import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type Env } from '../shared/middleware';

const toolsRouter = new Hono<{ Bindings: Env }>();

// Tool manifest schema (following MCP protocol)
const ToolManifestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  version: z.string().default('1.0.0'),
  author: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    agent_id: z.string()
  }),
  inputSchema: z.record(z.any()), // JSON Schema
  outputSchema: z.record(z.any()).optional(), // JSON Schema
  pricing: z.object({
    model: z.enum(['per-call', 'per-token', 'subscription']),
    amount: z.number().nonnegative(),
    currency: z.enum(['USDC', 'ETH']).default('USDC'),
    token_multiplier: z.number().optional() // For per-token pricing
  }),
  tags: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  requirements: z.object({
    min_balance: z.number().optional(),
    required_permissions: z.array(z.string()).optional(),
    supported_chains: z.array(z.enum(['base', 'polygon', 'ethereum'])).optional()
  }).optional(),
  endpoint: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST'),
    headers: z.record(z.string()).optional(),
    auth_type: z.enum(['bearer', 'api-key', 'oauth', 'none']).default('bearer')
  }),
  metadata: z.record(z.any()).optional()
});

const UpdateToolSchema = ToolManifestSchema.partial().required({
  name: true
});

// Register a new tool
toolsRouter.post('/register', async (c) => {
  const body = await c.req.json();
  const parseResult = ToolManifestSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid tool manifest',
      cause: parseResult.error.errors
    });
  }

  const manifest = parseResult.data;
  const toolId = crypto.randomUUID();
  
  try {
    // Check if tool name already exists
    const existingTool = await c.env.AUTH_STORE.get(`tool:name:${manifest.name}`);
    
    if (existingTool) {
      throw new HTTPException(409, {
        message: 'Tool with this name already exists'
      });
    }
    
    // Store tool manifest
    const tool = {
      id: toolId,
      ...manifest,
      status: 'active',
      registered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stats: {
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        total_revenue: 0
      }
    };
    
    // Store by ID
    await c.env.AUTH_STORE.put(
      `tool:${toolId}`,
      JSON.stringify(tool),
      {
        metadata: {
          name: manifest.name,
          agent_id: manifest.author.agent_id,
          categories: manifest.categories.join(',')
        }
      }
    );
    
    // Store name -> ID mapping
    await c.env.AUTH_STORE.put(
      `tool:name:${manifest.name}`,
      toolId
    );
    
    // Update categories index
    for (const category of manifest.categories) {
      const categoryTools = await c.env.AUTH_STORE.get(`tool:category:${category}`, 'json') || [];
      categoryTools.push(toolId);
      await c.env.AUTH_STORE.put(
        `tool:category:${category}`,
        JSON.stringify(categoryTools)
      );
    }
    
    return c.json({
      success: true,
      tool
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Register tool error:', error);
    throw new HTTPException(500, {
      message: 'Failed to register tool'
    });
  }
});

// Get tool by ID or name
toolsRouter.get('/:identifier', async (c) => {
  const identifier = c.req.param('identifier');
  
  try {
    let toolId = identifier;
    
    // Check if identifier is a name
    if (!identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const mappedId = await c.env.AUTH_STORE.get(`tool:name:${identifier}`);
      if (!mappedId) {
        throw new HTTPException(404, {
          message: 'Tool not found'
        });
      }
      toolId = mappedId;
    }
    
    const tool = await c.env.AUTH_STORE.get(`tool:${toolId}`, 'json');
    
    if (!tool) {
      throw new HTTPException(404, {
        message: 'Tool not found'
      });
    }
    
    return c.json({
      success: true,
      tool
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get tool error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get tool'
    });
  }
});

// Update tool
toolsRouter.put('/:toolId', async (c) => {
  const toolId = c.req.param('toolId');
  const body = await c.req.json();
  const parseResult = UpdateToolSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid update data',
      cause: parseResult.error.errors
    });
  }

  try {
    const existingTool = await c.env.AUTH_STORE.get(`tool:${toolId}`, 'json');
    
    if (!existingTool) {
      throw new HTTPException(404, {
        message: 'Tool not found'
      });
    }
    
    // Check ownership
    const agentId = c.req.header('X-Agent-ID');
    if (agentId && existingTool.author.agent_id !== agentId) {
      throw new HTTPException(403, {
        message: 'Unauthorized to update this tool'
      });
    }
    
    // Update tool
    const updatedTool = {
      ...existingTool,
      ...parseResult.data,
      id: toolId, // Ensure ID doesn't change
      updated_at: new Date().toISOString()
    };
    
    await c.env.AUTH_STORE.put(
      `tool:${toolId}`,
      JSON.stringify(updatedTool)
    );
    
    return c.json({
      success: true,
      tool: updatedTool
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Update tool error:', error);
    throw new HTTPException(500, {
      message: 'Failed to update tool'
    });
  }
});

// Search tools
toolsRouter.get('/', async (c) => {
  const query = c.req.query('q');
  const category = c.req.query('category');
  const tag = c.req.query('tag');
  const agentId = c.req.query('agent_id');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  
  try {
    let toolIds: string[] = [];
    
    if (category) {
      // Get tools by category
      const categoryTools = await c.env.AUTH_STORE.get(`tool:category:${category}`, 'json') || [];
      toolIds = categoryTools;
    } else {
      // Get all tools
      const list = await c.env.AUTH_STORE.list({
        prefix: 'tool:',
        limit: 1000
      });
      
      toolIds = list.keys
        .filter(key => key.name.match(/^tool:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/))
        .map(key => key.name.replace('tool:', ''));
    }
    
    // Load and filter tools
    const tools = [];
    for (const id of toolIds) {
      const tool = await c.env.AUTH_STORE.get(`tool:${id}`, 'json');
      if (!tool) continue;
      
      // Apply filters
      if (query && !tool.name.toLowerCase().includes(query.toLowerCase()) && 
          !tool.description.toLowerCase().includes(query.toLowerCase())) {
        continue;
      }
      
      if (tag && !tool.tags.includes(tag)) {
        continue;
      }
      
      if (agentId && tool.author.agent_id !== agentId) {
        continue;
      }
      
      tools.push(tool);
    }
    
    // Sort by registration date (newest first)
    tools.sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());
    
    // Paginate
    const paginatedTools = tools.slice(offset, offset + limit);
    
    return c.json({
      success: true,
      tools: paginatedTools,
      pagination: {
        limit,
        offset,
        total: tools.length,
        has_more: offset + limit < tools.length
      }
    });
  } catch (error) {
    console.error('Search tools error:', error);
    throw new HTTPException(500, {
      message: 'Failed to search tools'
    });
  }
});

// Delete tool (soft delete)
toolsRouter.delete('/:toolId', async (c) => {
  const toolId = c.req.param('toolId');
  
  try {
    const tool = await c.env.AUTH_STORE.get(`tool:${toolId}`, 'json');
    
    if (!tool) {
      throw new HTTPException(404, {
        message: 'Tool not found'
      });
    }
    
    // Check ownership
    const agentId = c.req.header('X-Agent-ID');
    if (agentId && tool.author.agent_id !== agentId) {
      throw new HTTPException(403, {
        message: 'Unauthorized to delete this tool'
      });
    }
    
    // Soft delete by updating status
    tool.status = 'deleted';
    tool.deleted_at = new Date().toISOString();
    
    await c.env.AUTH_STORE.put(
      `tool:${toolId}`,
      JSON.stringify(tool)
    );
    
    // Remove from name mapping
    await c.env.AUTH_STORE.delete(`tool:name:${tool.name}`);
    
    return c.json({
      success: true,
      message: 'Tool deleted successfully'
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Delete tool error:', error);
    throw new HTTPException(500, {
      message: 'Failed to delete tool'
    });
  }
});

// Get tool stats
toolsRouter.get('/:toolId/stats', async (c) => {
  const toolId = c.req.param('toolId');
  const period = c.req.query('period') || '7d';
  
  try {
    const tool = await c.env.AUTH_STORE.get(`tool:${toolId}`, 'json');
    
    if (!tool) {
      throw new HTTPException(404, {
        message: 'Tool not found'
      });
    }
    
    // In production, this would aggregate from analytics
    const stats = {
      tool_id: toolId,
      period,
      metrics: {
        total_calls: tool.stats.total_calls,
        successful_calls: tool.stats.successful_calls,
        failed_calls: tool.stats.failed_calls,
        success_rate: tool.stats.total_calls > 0 
          ? (tool.stats.successful_calls / tool.stats.total_calls) * 100 
          : 0,
        total_revenue: tool.stats.total_revenue,
        average_response_time_ms: 250, // Mock data
        unique_agents: 42 // Mock data
      },
      daily_breakdown: [] // Would contain daily metrics
    };
    
    return c.json({
      success: true,
      stats
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get tool stats error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get tool statistics'
    });
  }
});

export { toolsRouter };