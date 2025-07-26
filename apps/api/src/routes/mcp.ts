import { Hono } from 'hono';
import { z } from 'zod';
import { mcpAuth, type Env } from '../shared/middleware';
import { TOOLS } from '../tools';

const mcpRouter = new Hono<{ Bindings: Env }>();

// Apply MCP authentication to all routes
mcpRouter.use('*', mcpAuth());

// MCP Request schema
const McpRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.any().optional()
});

// Main MCP protocol handler
mcpRouter.post('/', async (c) => {
  const body = await c.req.json();
  
  // Validate request
  const parseResult = McpRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32700,
        message: 'Parse error'
      }
    });
  }

  const { method, params, id } = parseResult.data;

  try {
    switch (method) {
      case 'tools/list':
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema
            }))
          }
        });

      case 'tools/call':
        const { name: toolName, arguments: toolArgs } = params || {};
        
        const tool = TOOLS.find(t => t.name === toolName);
        if (!tool) {
          return c.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Tool not found: ${toolName}`
            }
          });
        }

        // Validate tool arguments
        const argParseResult = tool.inputSchema.safeParse(toolArgs);
        if (!argParseResult.success) {
          return c.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Invalid parameters',
              data: argParseResult.error.errors
            }
          });
        }

        // Execute tool
        const result = await tool.handler(argParseResult.data, c);
        
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }]
          }
        });

      case 'resources/list':
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            resources: []
          }
        });

      case 'resources/get':
        return c.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Resources not implemented'
          }
        });

      case 'completion/complete':
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            completion: {
              values: []
            }
          }
        });

      default:
        return c.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
    }
  } catch (error) {
    console.error('MCP handler error:', error);
    return c.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

export { mcpRouter };