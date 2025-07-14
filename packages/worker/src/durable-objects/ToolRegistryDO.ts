import { DurableObject } from "@cloudflare/workers-types";
import { Env, ToolManifest } from "../types/env";

export class ToolRegistryDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (url.pathname) {
        case '/register':
          return this.handleRegisterTool(request);
        case '/search':
          return this.handleSearchTools(request);
        case '/get':
          return this.handleGetTool(request);
        case '/update':
          return this.handleUpdateTool(request);
        case '/delete':
          return this.handleDeleteTool(request);
        case '/by-agent':
          return this.handleGetToolsByAgent(request);
        case '/categories':
          return this.handleGetCategories(request);
        default:
          return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('[ToolRegistryDO] Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  private async handleRegisterTool(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const toolData = await request.json();

      // Validate required fields
      const requiredFields = ['name', 'description', 'owner_agent_id', 'endpoint', 'pricing', 'input_schema'];
      for (const field of requiredFields) {
        if (!toolData[field]) {
          return new Response(JSON.stringify({
            error: `Missing required field: ${field}`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Verify the owner agent exists
      const ownerAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(toolData.owner_agent_id));
      const ownerResponse = await ownerAgentState.fetch(new Request(`${this.env.API_BASE_URL}/info`));

      if (!ownerResponse.ok) {
        return new Response(JSON.stringify({
          error: 'Owner agent not found or invalid'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const now = new Date().toISOString();
      const toolManifest: ToolManifest = {
        manifest_version: '1.0',
        name: toolData.name,
        description: toolData.description,
        owner_agent_id: toolData.owner_agent_id,
        endpoint: toolData.endpoint,
        authentication: toolData.authentication || { type: 'none' },
        pricing: toolData.pricing,
        input_schema: toolData.input_schema,
        output_schema: toolData.output_schema,
        tags: toolData.tags || [],
        created_at: now,
        updated_at: now
      };

      // Store in DO state
      await this.state.storage.put(`tool:${toolData.name}`, toolManifest);

      // Store in marketplace database for searchability
      await this.storeInMarketplace(toolManifest);

      // Cache in KV for fast access
      await this.cacheToolManifest(toolManifest);

      return new Response(JSON.stringify({
        success: true,
        tool_name: toolManifest.name,
        created_at: toolManifest.created_at
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[ToolRegistryDO] Register tool error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to register tool',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleSearchTools(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const searchTerm = url.searchParams.get('q') || '';
      const tags = url.searchParams.get('tags')?.split(',') || [];
      const category = url.searchParams.get('category');
      const owner = url.searchParams.get('owner');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // Build SQL query
      let query = `
        SELECT * FROM tools
        WHERE 1=1
      `;
      const params: any[] = [];

      if (searchTerm) {
        query += ` AND (name LIKE ? OR description LIKE ?)`;
        params.push(`%${searchTerm}%`, `%${searchTerm}%`);
      }

      if (tags.length > 0) {
        const tagConditions = tags.map(() => `tags LIKE ?`).join(' OR ');
        query += ` AND (${tagConditions})`;
        tags.forEach(tag => params.push(`%${tag}%`));
      }

      if (category) {
        query += ` AND tags LIKE ?`;
        params.push(`%${category}%`);
      }

      if (owner) {
        query += ` AND owner_agent_id = ?`;
        params.push(owner);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = this.env.MARKETPLACE_DB.prepare(query);
      const results = await stmt.bind(...params).all();

      const tools = results.results?.map((row: any) => ({
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        input_schema: JSON.parse(row.input_schema || '{}'),
        output_schema: row.output_schema ? JSON.parse(row.output_schema) : null,
        endpoint: JSON.parse(row.endpoint || '{}'),
        authentication: JSON.parse(row.authentication || '{}'),
        pricing: JSON.parse(row.pricing || '{}')
      })) || [];

      return new Response(JSON.stringify({
        tools,
        total: results.results?.length || 0,
        limit,
        offset,
        search_term: searchTerm,
        filters: { tags, category, owner }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[ToolRegistryDO] Search tools error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to search tools',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleGetTool(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const toolName = url.searchParams.get('name');

      if (!toolName) {
        return new Response(JSON.stringify({ error: 'Tool name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // First try to get from DO storage (hot cache)
      const toolManifest = await this.state.storage.get<ToolManifest>(`tool:${toolName}`);

      if (toolManifest) {
        return new Response(JSON.stringify(toolManifest), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fallback to KV cache
      const cachedTool = await this.env.TOOL_CACHE.get(toolName, 'json');
      if (cachedTool) {
        // Also store in DO for faster next access
        await this.state.storage.put(`tool:${toolName}`, cachedTool);
        return new Response(JSON.stringify(cachedTool), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fallback to database
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        SELECT * FROM tools WHERE name = ?
      `);
      const result = await stmt.bind(toolName).first();

      if (!result) {
        return new Response(JSON.stringify({ error: 'Tool not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const tool = {
        ...result,
        tags: JSON.parse(result.tags || '[]'),
        input_schema: JSON.parse(result.input_schema || '{}'),
        output_schema: result.output_schema ? JSON.parse(result.output_schema) : null,
        endpoint: JSON.parse(result.endpoint || '{}'),
        authentication: JSON.parse(result.authentication || '{}'),
        pricing: JSON.parse(result.pricing || '{}')
      };

      // Cache for future requests
      await this.state.storage.put(`tool:${toolName}`, tool);
      await this.env.TOOL_CACHE.put(toolName, JSON.stringify(tool), { expirationTtl: 3600 });

      return new Response(JSON.stringify(tool), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[ToolRegistryDO] Get tool error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to get tool',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleUpdateTool(request: Request): Promise<Response> {
    if (request.method !== 'PUT') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { name, ...updates } = await request.json();

      if (!name) {
        return new Response(JSON.stringify({ error: 'Tool name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const existingTool = await this.state.storage.get<ToolManifest>(`tool:${name}`);
      if (!existingTool) {
        return new Response(JSON.stringify({ error: 'Tool not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update allowed fields
      const updatedTool: ToolManifest = {
        ...existingTool,
        ...updates,
        updated_at: new Date().toISOString()
      };

      await this.state.storage.put(`tool:${name}`, updatedTool);
      await this.storeInMarketplace(updatedTool);
      await this.cacheToolManifest(updatedTool);

      return new Response(JSON.stringify({
        success: true,
        updated_at: updatedTool.updated_at
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[ToolRegistryDO] Update tool error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to update tool',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleDeleteTool(request: Request): Promise<Response> {
    if (request.method !== 'DELETE') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const toolName = url.searchParams.get('name');

      if (!toolName) {
        return new Response(JSON.stringify({ error: 'Tool name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Remove from DO storage
      await this.state.storage.delete(`tool:${toolName}`);

      // Remove from database
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        DELETE FROM tools WHERE name = ?
      `);
      await stmt.bind(toolName).run();

      // Remove from cache
      await this.env.TOOL_CACHE.delete(toolName);

      return new Response(JSON.stringify({
        success: true,
        deleted_tool: toolName
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[ToolRegistryDO] Delete tool error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to delete tool',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleGetToolsByAgent(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const agentId = url.searchParams.get('agent_id');

      if (!agentId) {
        return new Response(JSON.stringify({ error: 'Agent ID is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const stmt = this.env.MARKETPLACE_DB.prepare(`
        SELECT * FROM tools WHERE owner_agent_id = ? ORDER BY created_at DESC
      `);
      const results = await stmt.bind(agentId).all();

      const tools = results.results?.map((row: any) => ({
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        input_schema: JSON.parse(row.input_schema || '{}'),
        output_schema: row.output_schema ? JSON.parse(row.output_schema) : null,
        endpoint: JSON.parse(row.endpoint || '{}'),
        authentication: JSON.parse(row.authentication || '{}'),
        pricing: JSON.parse(row.pricing || '{}')
      })) || [];

      return new Response(JSON.stringify({
        agent_id: agentId,
        tools,
        total: tools.length
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[ToolRegistryDO] Get tools by agent error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to get tools by agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleGetCategories(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Get all unique tags from tools
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        SELECT DISTINCT tags FROM tools WHERE tags IS NOT NULL AND tags != '[]'
      `);
      const results = await stmt.all();

      const categoriesSet = new Set<string>();
      results.results?.forEach((row: any) => {
        try {
          const tags = JSON.parse(row.tags || '[]');
          tags.forEach((tag: string) => categoriesSet.add(tag));
        } catch (e) {
          // Ignore invalid JSON
        }
      });

      const categories = Array.from(categoriesSet).sort();

      return new Response(JSON.stringify({
        categories,
        total: categories.length
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[ToolRegistryDO] Get categories error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to get categories',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Helper methods
  private async storeInMarketplace(tool: ToolManifest): Promise<void> {
    try {
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        INSERT OR REPLACE INTO tools (
          name, description, owner_agent_id, endpoint, authentication, pricing,
          input_schema, output_schema, tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      await stmt.bind(
        tool.name,
        tool.description,
        tool.owner_agent_id,
        JSON.stringify(tool.endpoint),
        JSON.stringify(tool.authentication),
        JSON.stringify(tool.pricing),
        JSON.stringify(tool.input_schema),
        tool.output_schema ? JSON.stringify(tool.output_schema) : null,
        JSON.stringify(tool.tags),
        tool.created_at,
        tool.updated_at
      ).run();
    } catch (error) {
      console.error('[ToolRegistryDO] Failed to store in marketplace:', error);
    }
  }

  private async cacheToolManifest(tool: ToolManifest): Promise<void> {
    try {
      await this.env.TOOL_CACHE.put(tool.name, JSON.stringify(tool), {
        expirationTtl: 3600 // 1 hour cache
      });
    } catch (error) {
      console.error('[ToolRegistryDO] Failed to cache tool manifest:', error);
    }
  }
}
