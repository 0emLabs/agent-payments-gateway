import { z } from 'zod';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { 
  errorHandler, 
  rateLimiter, 
  securityHeaders, 
  requestLogger, 
  STANDARD_CORS_CONFIG 
} from './shared/middleware';
import { 
  x402Middleware, 
  X402Config
} from './x402-hono';

// Environment interface for Cloudflare Worker
interface Env {
  AUTH_STORE?: KVNamespace;
  STATE_STORE?: KVNamespace;
  USDC_CONTRACT_ADDRESS: string;
  PAYMENT_DESTINATION?: string;
  ALLOWED_ORIGINS?: string;
  FACILITATOR_URL?: string;
  [key: string]: any; // Add index signature for Hono compatibility
}

// Use your wallet address as the payment destination
const WORKER_PAYMENT_ADDRESS = '0x73e741aEC0a1a3134a444d865b591d7363c5Be71' as `0x${string}`;

// Define MCP request/response types
interface McpRequest {
  method: 'tools/list' | 'tools/call' | 'resources/list' | 'resources/get';
  params?: {
    name?: string;
    arguments?: any;
    uri?: string;
  };
  id?: string | number;
}

interface McpResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

// Input schemas for MCP tools
const TestToolSchema = z.object({
  message: z.string().describe('Test message to echo back'),
  delay: z.number().optional().default(0).describe('Delay in milliseconds before responding')
});

const CalculateSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('Mathematical operation'),
  a: z.number().describe('First number'),
  b: z.number().describe('Second number')
});

const GenerateDataSchema = z.object({
  type: z.enum(['users', 'products', 'orders']).describe('Type of test data to generate'),
  count: z.number().min(1).max(100).default(10).describe('Number of items to generate')
});

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// X402 Configuration with official facilitator
const x402Config: X402Config = {
  paymentAmount: '1000', // 0.001 USDC (1000 atomic units for 6-decimal USDC)
  token: 'USDC',
  network: 'base-sepolia',
  paymentDestination: WORKER_PAYMENT_ADDRESS, // Will be overridden by env var if provided
  x402Version: 1,
  facilitatorUrl: 'https://x402.org/facilitator' // Official X402 testnet facilitator
};

// Enable CORS and standard middleware
app.use('*', cors(STANDARD_CORS_CONFIG));
app.use('*', securityHeaders);
app.use('*', requestLogger);
app.use('/api/*', rateLimiter(60, 60)); // 60 requests per 60 minutes for API routes
app.use('/paid/*', rateLimiter(30, 60)); // 30 requests per 60 minutes for paid routes
app.onError(errorHandler);

// Apply X402 middleware to protected routes
// This will automatically protect any route starting with /paid/
app.use('/paid/*', x402Middleware(x402Config));

// Health check
app.get('/_health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'Test MCP Server with X402',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    protocol: 'X402 v1 (Official Spec Compliant)',
    facilitator: x402Config.facilitatorUrl || 'Local validation only',
    mcp: {
      version: '1.0.0',
      capabilities: ['tools', 'resources'],
      tools: ['test_tool', 'calculate', 'generate_data'],
      protectedTools: ['premium_analysis', 'advanced_calculation']
    }
  });
});

// MCP Server info endpoint
app.get('/', (c) => {
  const paymentDestination = c.env.PAYMENT_DESTINATION || WORKER_PAYMENT_ADDRESS;
  
  const info = {
    service: 'Test MCP Server with X-402 Payment Integration',
    version: '1.0.0',
    description: 'A simple MCP server that demonstrates X402 payment integration',
    protocol: {
      x402Version: 1,
      standard: 'https://github.com/coinbase/x402',
      description: 'HTTP-native payments using the 402 status code',
      facilitator: x402Config.facilitatorUrl || 'Local validation only'
    },
    mcp: {
      capabilities: ['tools', 'resources'],
      tools: {
        free: ['test_tool', 'calculate', 'generate_data'],
        paid: ['premium_analysis', 'advanced_calculation']
      },
      resources: {
        free: ['test_data'],
        paid: ['premium_data']
      }
    },
    payment: {
      required: true,
      amount: x402Config.paymentAmount + ' atomic units', // 1000 = 0.001 USDC
      token: x402Config.token,
      destination: paymentDestination,
      network: x402Config.network,
      scheme: 'exact',
      asset: c.env.USDC_CONTRACT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    },
    endpoints: {
      '/': 'Server information',
      '/_health': 'Health check',
      '/mcp/tools/list': 'List available MCP tools',
      '/mcp/tools/call': 'Call an MCP tool',
      '/mcp/resources/list': 'List available MCP resources',
      '/mcp/resources/get': 'Get an MCP resource',
      '/paid/mcp/tools/call': 'Call premium MCP tools (requires 0.001 USDC payment)',
      '/paid/mcp/resources/get': 'Get premium MCP resources (requires payment)'
    }
  };

  return c.json(info, 200);
});

// ========== FREE MCP ENDPOINTS ==========

// List available tools
app.post('/mcp/tools/list', async (c) => {
  const request: McpRequest = await c.req.json();
  
  const response: McpResponse = {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      tools: [
        {
          name: 'test_tool',
          description: 'A simple test tool that echoes back a message',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Test message to echo back'
              },
              delay: {
                type: 'number',
                description: 'Delay in milliseconds before responding',
                default: 0
              }
            },
            required: ['message']
          }
        },
        {
          name: 'calculate',
          description: 'Perform basic mathematical operations',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['add', 'subtract', 'multiply', 'divide'],
                description: 'Mathematical operation'
              },
              a: {
                type: 'number',
                description: 'First number'
              },
              b: {
                type: 'number',
                description: 'Second number'
              }
            },
            required: ['operation', 'a', 'b']
          }
        },
        {
          name: 'generate_data',
          description: 'Generate test data for various entities',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['users', 'products', 'orders'],
                description: 'Type of test data to generate'
              },
              count: {
                type: 'number',
                minimum: 1,
                maximum: 100,
                default: 10,
                description: 'Number of items to generate'
              }
            },
            required: ['type']
          }
        }
      ]
    }
  };

  return c.json(response);
});

// Call a tool
app.post('/mcp/tools/call', async (c) => {
  const request: McpRequest = await c.req.json();
  
  if (!request.params?.name) {
    return c.json({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid params: tool name is required'
      }
    }, 400);
  }

  const toolName = request.params.name;
  const args = request.params.arguments || {};

  let result: any;

  try {
    switch (toolName) {
      case 'test_tool':
        const testParams = TestToolSchema.parse(args);
        if (testParams.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, testParams.delay));
        }
        result = {
          content: [
            {
              type: 'text',
              text: `Echo: ${testParams.message}`
            }
          ]
        };
        break;

      case 'calculate':
        const calcParams = CalculateSchema.parse(args);
        let calcResult: number;
        switch (calcParams.operation) {
          case 'add':
            calcResult = calcParams.a + calcParams.b;
            break;
          case 'subtract':
            calcResult = calcParams.a - calcParams.b;
            break;
          case 'multiply':
            calcResult = calcParams.a * calcParams.b;
            break;
          case 'divide':
            if (calcParams.b === 0) {
              throw new Error('Division by zero');
            }
            calcResult = calcParams.a / calcParams.b;
            break;
        }
        result = {
          content: [
            {
              type: 'text',
              text: `${calcParams.a} ${calcParams.operation} ${calcParams.b} = ${calcResult}`
            }
          ]
        };
        break;

      case 'generate_data':
        const dataParams = GenerateDataSchema.parse(args);
        const generatedData = generateTestData(dataParams.type, dataParams.count);
        result = {
          content: [
            {
              type: 'text',
              text: `Generated ${dataParams.count} ${dataParams.type}:\n${JSON.stringify(generatedData, null, 2)}`
            }
          ]
        };
        break;

      default:
        return c.json({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Tool not found: ${toolName}`
          }
        }, 404);
    }

    const response: McpResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result
    };

    return c.json(response);

  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    }, 500);
  }
});

// List resources
app.post('/mcp/resources/list', async (c) => {
  const request: McpRequest = await c.req.json();
  
  const response: McpResponse = {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      resources: [
        {
          uri: 'test://demo-data',
          name: 'Demo Data',
          description: 'Sample demonstration data',
          mimeType: 'application/json'
        },
        {
          uri: 'test://server-info',
          name: 'Server Information',
          description: 'Information about this MCP server',
          mimeType: 'application/json'
        }
      ]
    }
  };

  return c.json(response);
});

// Get a resource
app.post('/mcp/resources/get', async (c) => {
  const request: McpRequest = await c.req.json();
  
  if (!request.params?.uri) {
    return c.json({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid params: resource URI is required'
      }
    }, 400);
  }

  const uri = request.params.uri;
  let content: any;

  switch (uri) {
    case 'test://demo-data':
      content = {
        demo: true,
        message: 'This is free demo data',
        timestamp: new Date().toISOString(),
        sampleData: generateTestData('users', 3)
      };
      break;

    case 'test://server-info':
      content = {
        server: 'Test MCP Server with X402',
        version: '1.0.0',
        capabilities: ['tools', 'resources'],
        uptime: 'running'
      };
      break;

    default:
      return c.json({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Resource not found: ${uri}`
        }
      }, 404);
  }

  const response: McpResponse = {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(content, null, 2)
        }
      ]
    }
  };

  return c.json(response);
});

// ========== PAID MCP ENDPOINTS (X402 PROTECTED) ==========

// Premium tool calls (protected by X402)
app.post('/paid/mcp/tools/call', async (c) => {
  const request: McpRequest = await c.req.json();
  
  if (!request.params?.name) {
    return c.json({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid params: tool name is required'
      }
    }, 400);
  }

  const toolName = request.params.name;
  const args = request.params.arguments || {};

  let result: any;

  try {
    switch (toolName) {
      case 'premium_analysis':
        result = {
          content: [
            {
              type: 'text',
              text: `🔐 Premium Analysis Results:\n\nAdvanced insights:\n- Market trend: Bullish\n- Risk score: 7.3/10\n- Confidence: 94%\n- Premium data points: 1,247\n\nPayment verified via X402 protocol ✅`
            }
          ]
        };
        break;

      case 'advanced_calculation':
        const advancedParams = CalculateSchema.parse(args);
        const result_val = Math.pow(advancedParams.a, advancedParams.b);
        const statistics = {
          mean: (advancedParams.a + advancedParams.b) / 2,
          variance: Math.pow(advancedParams.a - advancedParams.b, 2) / 4,
          correlation: 0.85 // Mock correlation
        };
        result = {
          content: [
            {
              type: 'text',
              text: `🧮 Advanced Calculation Results:\n\nPower operation: ${advancedParams.a}^${advancedParams.b} = ${result_val}\n\nStatistical Analysis:\n- Mean: ${statistics.mean}\n- Variance: ${statistics.variance}\n- Correlation: ${statistics.correlation}\n\nPayment verified via X402 protocol ✅`
            }
          ]
        };
        break;

      default:
        return c.json({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Premium tool not found: ${toolName}`
          }
        }, 404);
    }

    const response: McpResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result
    };

    return c.json(response);

  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    }, 500);
  }
});

// Premium resources (protected by X402)
app.post('/paid/mcp/resources/get', async (c) => {
  const request: McpRequest = await c.req.json();
  
  if (!request.params?.uri) {
    return c.json({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid params: resource URI is required'
      }
    }, 400);
  }

  const uri = request.params.uri;
  let content: any;

  switch (uri) {
    case 'premium://advanced-data':
      content = {
        premium: true,
        message: '🔐 This is premium protected data',
        timestamp: new Date().toISOString(),
        advancedMetrics: {
          performance: 98.5,
          reliability: 99.9,
          security: 100,
          satisfaction: 96.7
        },
        exclusiveData: generateTestData('orders', 10),
        paymentVerified: true
      };
      break;

    case 'premium://analytics':
      content = {
        analytics: {
          totalUsers: 15429,
          activeUsers: 8234,
          revenue: '$127,849.32',
          growthRate: '14.7%',
          churnRate: '2.3%'
        },
        trends: [
          { month: 'Jan', value: 12000 },
          { month: 'Feb', value: 15000 },
          { month: 'Mar', value: 18000 },
          { month: 'Apr', value: 22000 }
        ],
        premium: true,
        paymentVerified: true
      };
      break;

    default:
      return c.json({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Premium resource not found: ${uri}`
        }
      }, 404);
  }

  const response: McpResponse = {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(content, null, 2)
        }
      ]
    }
  };

  return c.json(response);
});

// ========== HELPER FUNCTIONS ==========

function generateTestData(type: 'users' | 'products' | 'orders', count: number) {
  const data = [];
  
  for (let i = 1; i <= count; i++) {
    switch (type) {
      case 'users':
        data.push({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          created: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
        });
        break;
      
      case 'products':
        data.push({
          id: i,
          name: `Product ${i}`,
          price: Math.round(Math.random() * 1000 * 100) / 100,
          category: ['Electronics', 'Clothing', 'Books', 'Home'][Math.floor(Math.random() * 4)],
          inStock: Math.random() > 0.2
        });
        break;
      
      case 'orders':
        data.push({
          id: i,
          userId: Math.floor(Math.random() * 100) + 1,
          amount: Math.round(Math.random() * 500 * 100) / 100,
          status: ['pending', 'completed', 'shipped', 'cancelled'][Math.floor(Math.random() * 4)],
          created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        });
        break;
    }
  }
  
  return data;
}

// Catch-all route for 404s
app.all('*', (c) => {
  const path = c.req.path;
  console.error(`[404] Unhandled route: ${c.req.method} ${path}`);

  return c.json({
    error: 'Route not found',
    path: path,
    method: c.req.method,
    availableRoutes: [
      'GET /',
      'GET /_health',
      'POST /mcp/tools/list',
      'POST /mcp/tools/call',
      'POST /mcp/resources/list', 
      'POST /mcp/resources/get',
      'POST /paid/mcp/tools/call (requires X402 payment)',
      'POST /paid/mcp/resources/get (requires X402 payment)'
    ],
    note: 'All /paid/* routes require payment via X402 protocol (0.001 USDC on Base Sepolia)'
  }, 404);
});

export default app;
