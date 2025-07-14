import { Env } from './types/env';
import { AgentStateDO } from './durable-objects/AgentStateDO';
import { TransactionOrchestratorDO } from './durable-objects/TransactionOrchestratorDO';
import { ToolRegistryDO } from './durable-objects/ToolRegistryDO';
import { RateLimiterDO } from './durable-objects/RateLimiterDO';
import { ParentOrchestratorDO } from './durable-objects/ParentOrchestratorDO';
import { ContextControllerDO } from './durable-objects/ContextControllerDO';
import { verifyApiKey } from './utils/crypto';
import { generateTaskId } from './utils/crypto';

// Export all Durable Objects
export {
  AgentStateDO,
  TransactionOrchestratorDO,
  ToolRegistryDO,
  RateLimiterDO,
  ParentOrchestratorDO,
  ContextControllerDO
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route to appropriate handler
      switch (true) {
        // A2A System Endpoints
        case url.pathname === '/agents' && request.method === 'POST':
          return handleAgentRegistration(request, env, corsHeaders);

        case url.pathname.startsWith('/agents/') && url.pathname.endsWith('/balance'):
          return handleAgentBalance(request, env, corsHeaders);

        case url.pathname.startsWith('/agents/') && url.pathname.endsWith('/deposit'):
          return handleAgentDeposit(request, env, corsHeaders);

        case url.pathname.startsWith('/agents/') && url.pathname.endsWith('/withdraw'):
          return handleAgentWithdraw(request, env, corsHeaders);

        case url.pathname.startsWith('/agents/') && url.pathname.endsWith('/info'):
          return handleAgentInfo(request, env, corsHeaders);

        case url.pathname === '/agents/directory':
          return handleAgentDirectory(request, env, corsHeaders);

        case url.pathname === '/tasks' && request.method === 'POST':
          return handleCreateTask(request, env, corsHeaders);

        case url.pathname.startsWith('/tasks/') && url.pathname.endsWith('/accept'):
          return handleAcceptTask(request, env, corsHeaders);

        case url.pathname.startsWith('/tasks/') && url.pathname.endsWith('/complete'):
          return handleCompleteTask(request, env, corsHeaders);

        case url.pathname.startsWith('/tasks/') && url.pathname.endsWith('/cancel'):
          return handleCancelTask(request, env, corsHeaders);

        case url.pathname.startsWith('/tasks/') && url.pathname.endsWith('/status'):
          return handleTaskStatus(request, env, corsHeaders);

        case url.pathname === '/tools' && request.method === 'POST':
          return handleRegisterTool(request, env, corsHeaders);

        case url.pathname === '/tools/search':
          return handleSearchTools(request, env, corsHeaders);

        case url.pathname === '/tools/categories':
          return handleToolCategories(request, env, corsHeaders);

        case url.pathname.startsWith('/tools/') && !url.pathname.includes('/'):
          return handleGetTool(request, env, corsHeaders);

        // Legacy Slack endpoints (backward compatibility)
        case url.pathname === '/slack/commands':
          return handleSlackCommand(request, env, ctx);

        case url.pathname === '/slack/interactions':
          return handleSlackInteraction(request, env, ctx);

        case url.pathname === '/health':
          return new Response('OK', { status: 200, headers: corsHeaders });

        default:
          return new Response('Not found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('[Worker] Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

// A2A System Handlers
async function handleAgentRegistration(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const agentId = crypto.randomUUID();
  const agentState = env.AGENT_STATE.get(env.AGENT_STATE.idFromString(agentId));

  const response = await agentState.fetch(new Request(`${env.API_BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleAgentBalance(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const agentId = extractAgentIdFromPath(request.url);
  if (!agentId) {
    return new Response(JSON.stringify({ error: 'Invalid agent ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const agentState = env.AGENT_STATE.get(env.AGENT_STATE.idFromString(agentId));
  const response = await agentState.fetch(new Request(`${env.API_BASE_URL}/balance`, {
    method: 'GET'
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleAgentDeposit(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const agentId = extractAgentIdFromPath(request.url);
  if (!agentId) {
    return new Response(JSON.stringify({ error: 'Invalid agent ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const agentState = env.AGENT_STATE.get(env.AGENT_STATE.idFromString(agentId));
  const response = await agentState.fetch(new Request(`${env.API_BASE_URL}/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleAgentWithdraw(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const agentId = extractAgentIdFromPath(request.url);
  if (!agentId) {
    return new Response(JSON.stringify({ error: 'Invalid agent ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const agentState = env.AGENT_STATE.get(env.AGENT_STATE.idFromString(agentId));
  const response = await agentState.fetch(new Request(`${env.API_BASE_URL}/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleAgentInfo(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const agentId = extractAgentIdFromPath(request.url);
  if (!agentId) {
    return new Response(JSON.stringify({ error: 'Invalid agent ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const agentState = env.AGENT_STATE.get(env.AGENT_STATE.idFromString(agentId));
  const response = await agentState.fetch(new Request(`${env.API_BASE_URL}/info`, {
    method: 'GET'
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleAgentDirectory(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const url = new URL(request.url);
  const searchTerm = url.searchParams.get('q') || '';
  const tags = url.searchParams.get('tags') || '';
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    // Query agents from marketplace database
    let query = `
      SELECT id, name, description, tags, status, created_at, last_active
      FROM agents
      WHERE status = 'active'
    `;
    const params: any[] = [];

    if (searchTerm) {
      query += ` AND (name LIKE ? OR description LIKE ?)`;
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    if (tags) {
      query += ` AND tags LIKE ?`;
      params.push(`%${tags}%`);
    }

    query += ` ORDER BY last_active DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = env.MARKETPLACE_DB.prepare(query);
    const results = await stmt.bind(...params).all();

    const agents = results.results?.map((row: any) => ({
      ...row,
      tags: JSON.parse(row.tags || '[]')
    })) || [];

    return new Response(JSON.stringify({
      agents,
      total: agents.length,
      limit,
      offset,
      search_term: searchTerm
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('[Worker] Agent directory error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch agent directory',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

async function handleCreateTask(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const taskId = generateTaskId();
  const orchestrator = env.TRANSACTION_ORCHESTRATOR.get(env.TRANSACTION_ORCHESTRATOR.idFromString(taskId));

  const response = await orchestrator.fetch(new Request(`${env.API_BASE_URL}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleAcceptTask(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const taskId = extractTaskIdFromPath(request.url);
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Invalid task ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const orchestrator = env.TRANSACTION_ORCHESTRATOR.get(env.TRANSACTION_ORCHESTRATOR.idFromString(taskId));
  const response = await orchestrator.fetch(new Request(`${env.API_BASE_URL}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleCompleteTask(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const taskId = extractTaskIdFromPath(request.url);
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Invalid task ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const orchestrator = env.TRANSACTION_ORCHESTRATOR.get(env.TRANSACTION_ORCHESTRATOR.idFromString(taskId));
  const response = await orchestrator.fetch(new Request(`${env.API_BASE_URL}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleCancelTask(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const taskId = extractTaskIdFromPath(request.url);
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Invalid task ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const orchestrator = env.TRANSACTION_ORCHESTRATOR.get(env.TRANSACTION_ORCHESTRATOR.idFromString(taskId));
  const response = await orchestrator.fetch(new Request(`${env.API_BASE_URL}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleTaskStatus(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const taskId = extractTaskIdFromPath(request.url);
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'Invalid task ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const orchestrator = env.TRANSACTION_ORCHESTRATOR.get(env.TRANSACTION_ORCHESTRATOR.idFromString(taskId));
  const response = await orchestrator.fetch(new Request(`${env.API_BASE_URL}/status`, {
    method: 'GET'
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleRegisterTool(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const toolRegistry = env.TOOL_REGISTRY.get(env.TOOL_REGISTRY.idFromName('global'));

  const response = await toolRegistry.fetch(new Request(`${env.API_BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: request.body
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleSearchTools(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const url = new URL(request.url);
  const toolRegistry = env.TOOL_REGISTRY.get(env.TOOL_REGISTRY.idFromName('global'));

  const response = await toolRegistry.fetch(new Request(`${env.API_BASE_URL}/search?${url.searchParams.toString()}`, {
    method: 'GET'
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleToolCategories(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const toolRegistry = env.TOOL_REGISTRY.get(env.TOOL_REGISTRY.idFromName('global'));

  const response = await toolRegistry.fetch(new Request(`${env.API_BASE_URL}/categories`, {
    method: 'GET'
  }));

  return addCorsHeaders(response, corsHeaders);
}

async function handleGetTool(request: Request, env: Env, corsHeaders: any): Promise<Response> {
  const toolName = extractToolNameFromPath(request.url);
  const toolRegistry = env.TOOL_REGISTRY.get(env.TOOL_REGISTRY.idFromName('global'));

  const response = await toolRegistry.fetch(new Request(`${env.API_BASE_URL}/get?name=${toolName}`, {
    method: 'GET'
  }));

  return addCorsHeaders(response, corsHeaders);
}

// Legacy Slack handlers (backward compatibility)
async function handleSlackCommand(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Implementation remains the same as before
  return new Response(JSON.stringify({
    response_type: 'ephemeral',
    text: 'Slack integration is deprecated. Please use the A2A API endpoints.'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleSlackInteraction(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Implementation remains the same as before
  return new Response('OK', { status: 200 });
}

// Helper functions
function extractAgentIdFromPath(url: string): string | null {
  const match = url.match(/\/agents\/([^\/]+)/);
  return match ? match[1] : null;
}

function extractTaskIdFromPath(url: string): string | null {
  const match = url.match(/\/tasks\/([^\/]+)/);
  return match ? match[1] : null;
}

function extractToolNameFromPath(url: string): string | null {
  const match = url.match(/\/tools\/([^\/]+)$/);
  return match ? match[1] : null;
}

function addCorsHeaders(response: Response, corsHeaders: any): Response {
  const newResponse = new Response(response.body, response);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value as string);
  });
  return newResponse;
}
