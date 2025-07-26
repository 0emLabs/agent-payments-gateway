import { z } from 'zod';
import { Context } from 'hono';
import { type Env } from '../shared/middleware';

// Tool handler type
type ToolHandler = (args: any, c: Context<{ Bindings: Env }>) => Promise<any>;

// Tool definition interface
interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  handler: ToolHandler;
}

// Define tools following MCP protocol
export const TOOLS: Tool[] = [
  {
    name: 'create_agent',
    description: 'Create a new agent with an auto-provisioned wallet',
    inputSchema: z.object({
      name: z.string().describe('Agent name'),
      description: z.string().optional().describe('Agent description'),
      wallet_type: z.enum(['custodial', 'smart-wallet']).default('custodial').describe('Type of wallet to create'),
      chain: z.enum(['base', 'polygon', 'ethereum']).default('base').describe('Blockchain network')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        },
        body: JSON.stringify(args)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create agent: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'execute_task',
    description: 'Execute a task between two agents with automatic payment handling',
    inputSchema: z.object({
      from_agent_id: z.string().describe('ID of the agent requesting the task'),
      to_agent_id: z.string().describe('ID of the agent performing the task'),
      tool_name: z.string().describe('Name of the tool to execute'),
      parameters: z.record(z.any()).describe('Parameters for the tool'),
      payment_amount: z.number().positive().describe('Payment amount in USD'),
      estimate_tokens: z.boolean().default(true).describe('Whether to estimate token costs')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        },
        body: JSON.stringify({
          from_agent_id: args.from_agent_id,
          to_agent_id: args.to_agent_id,
          tool_name: args.tool_name,
          parameters: args.parameters,
          payment: {
            amount: args.payment_amount,
            currency: 'USDC'
          },
          options: {
            estimate_tokens: args.estimate_tokens
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to execute task: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'check_wallet_balance',
    description: 'Check the wallet balance of an agent',
    inputSchema: z.object({
      agent_id: z.string().describe('Agent ID to check balance for')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/agents/${args.agent_id}/wallet`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get wallet balance: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'transfer_funds',
    description: 'Transfer funds from one wallet to another',
    inputSchema: z.object({
      from_wallet_id: z.string().describe('Source wallet ID'),
      to_wallet_address: z.string().describe('Destination wallet address'),
      amount: z.number().positive().describe('Amount to transfer'),
      currency: z.enum(['USDC', 'ETH']).default('USDC').describe('Currency to transfer'),
      memo: z.string().optional().describe('Optional transfer memo')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/wallets/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        },
        body: JSON.stringify(args)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to transfer funds: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'estimate_token_cost',
    description: 'Estimate the token cost for a given text and AI model',
    inputSchema: z.object({
      text: z.string().describe('Text to estimate tokens for'),
      model: z.string().describe('AI model name (e.g., gpt-4, claude-3)'),
      include_escrow: z.boolean().default(true).describe('Include escrow buffer in estimation')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/tokens/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        },
        body: JSON.stringify(args)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to estimate tokens: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'register_tool',
    description: 'Register a new tool in the marketplace',
    inputSchema: z.object({
      name: z.string().describe('Tool name'),
      description: z.string().describe('Tool description'),
      author_agent_id: z.string().describe('Agent ID of the tool author'),
      pricing_model: z.enum(['per-call', 'per-token']).describe('How the tool is priced'),
      price_amount: z.number().nonnegative().describe('Price per call or per token'),
      endpoint_url: z.string().url().describe('URL endpoint for the tool'),
      input_schema: z.record(z.any()).describe('JSON Schema for tool inputs'),
      tags: z.array(z.string()).optional().describe('Tags for discovery')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/tools/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        },
        body: JSON.stringify({
          name: args.name,
          description: args.description,
          author: {
            name: 'Agent',
            agent_id: args.author_agent_id
          },
          pricing: {
            model: args.pricing_model,
            amount: args.price_amount,
            currency: 'USDC'
          },
          endpoint: {
            url: args.endpoint_url,
            method: 'POST'
          },
          inputSchema: args.input_schema,
          tags: args.tags || []
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to register tool: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'search_tools',
    description: 'Search for available tools in the marketplace',
    inputSchema: z.object({
      query: z.string().optional().describe('Search query'),
      category: z.string().optional().describe('Filter by category'),
      tag: z.string().optional().describe('Filter by tag'),
      limit: z.number().default(20).describe('Maximum results to return')
    }),
    handler: async (args, c) => {
      const params = new URLSearchParams();
      if (args.query) params.append('q', args.query);
      if (args.category) params.append('category', args.category);
      if (args.tag) params.append('tag', args.tag);
      params.append('limit', String(args.limit));
      
      const response = await fetch(`${c.env.WORKER_URL}/api/tools?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to search tools: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'create_escrow',
    description: 'Create an escrow for a payment between agents',
    inputSchema: z.object({
      from_agent_id: z.string().describe('Agent ID making the payment'),
      to_agent_id: z.string().describe('Agent ID receiving the payment'),
      amount: z.number().positive().describe('Escrow amount'),
      task_id: z.string().optional().describe('Associated task ID'),
      auto_release: z.boolean().default(false).describe('Auto-release after timeout'),
      timeout_seconds: z.number().default(3600).describe('Timeout in seconds')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/escrow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        },
        body: JSON.stringify({
          from_agent_id: args.from_agent_id,
          to_agent_id: args.to_agent_id,
          amount: args.amount,
          currency: 'USDC',
          task_id: args.task_id,
          conditions: {
            auto_release: args.auto_release,
            timeout_seconds: args.timeout_seconds
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create escrow: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'release_escrow',
    description: 'Release funds from an escrow',
    inputSchema: z.object({
      escrow_id: z.string().describe('Escrow ID to release'),
      release_to: z.enum(['provider', 'payer']).describe('Who to release funds to'),
      reason: z.string().optional().describe('Reason for release')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/escrow/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        },
        body: JSON.stringify(args)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to release escrow: ${await response.text()}`);
      }
      
      return await response.json();
    }
  },
  
  {
    name: 'get_task_status',
    description: 'Get the status of a task execution',
    inputSchema: z.object({
      task_id: z.string().describe('Task ID to check')
    }),
    handler: async (args, c) => {
      const response = await fetch(`${c.env.WORKER_URL}/api/tasks/${args.task_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${c.env.MCP_AUTH_SECRET}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get task status: ${await response.text()}`);
      }
      
      return await response.json();
    }
  }
];