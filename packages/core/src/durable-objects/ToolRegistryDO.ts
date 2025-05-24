import { DurableObjectState, Request, Response } from "@cloudflare/workers-types";
import { Env } from "../types/env";
import { ToolManifest } from "@0emlabs/agent-payments-types";

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
      const toolData = await request.json() as ToolManifest;

      if (!toolData.name || !toolData.description || !toolData.owner_agent_id || !toolData.endpoint) {
        return new Response(JSON.stringify({
          error: 'Missing required fields: name, description, owner_agent_id, endpoint'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if tool already exists for this owner
      const existingTool = await this.state.storage.get<ToolManifest>(`tool:${toolData.owner_agent_id}:${toolData.name}`);
      if (existingTool) {
        return new Response(JSON.stringify({
          error: 'Tool with this name already registered for this agent',
          tool: existingTool
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Store the tool manifest
      await this.state.storage.put(`tool:${toolData.owner_agent_id}:${toolData.name}`, toolData);

      return new Response(JSON.stringify({
        success: true,
        tool: toolData
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      console.error('[ToolRegistryDO] Registration error:', error);
      return new Response(JSON.stringify({
        error: 'Tool registration failed',
        message: error.message || 'Unknown error'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleGetTool(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const ownerAgentId = url.searchParams.get('ownerAgentId') as string;
    const toolName = url.searchParams.get('toolName') as string;

    if (!ownerAgentId || !toolName) {
      return new Response(JSON.stringify({ error: 'Missing ownerAgentId or toolName query parameters' }), { status: 400 });
    }

    const tool = await this.state.storage.get<ToolManifest>(`tool:${ownerAgentId}:${toolName}`);

    if (!tool) {
      return new Response(JSON.stringify({ error: 'Tool not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(tool), { headers: { 'Content-Type': 'application/json' } });
  }

  private async handleUpdateTool(request: Request): Promise<Response> {
    if (request.method !== 'PUT') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const toolData = await request.json() as ToolManifest;

      if (!toolData.owner_agent_id || !toolData.name) {
        return new Response(JSON.stringify({ error: 'Missing owner_agent_id or name in update payload' }), { status: 400 });
      }

      const existingTool = await this.state.storage.get<ToolManifest>(`tool:${toolData.owner_agent_id}:${toolData.name}`);
      if (!existingTool) {
        return new Response(JSON.stringify({ error: 'Tool not found' }), { status: 404 });
      }

      // Update allowed fields (e.g., description, endpoint, authentication, pricing, input_schema, output_schema, tags, rate_limit)
      const updatedTool: ToolManifest = {
        ...existingTool,
        ...toolData,
      };

      await this.state.storage.put(`tool:${toolData.owner_agent_id}:${toolData.name}`, updatedTool);

      return new Response(JSON.stringify({
        success: true,
        tool: updatedTool
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      console.error('[ToolRegistryDO] Update error:', error);
      return new Response(JSON.stringify({
        error: 'Tool update failed',
        message: error.message || 'Unknown error'
      }), {
        status: 400,
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
      const ownerAgentId = url.searchParams.get('ownerAgentId') as string;
      const toolName = url.searchParams.get('toolName') as string;

      if (!ownerAgentId || !toolName) {
        return new Response(JSON.stringify({ error: 'Missing ownerAgentId or toolName query parameters' }), { status: 400 });
      }

      const existingTool = await this.state.storage.get<ToolManifest>(`tool:${ownerAgentId}:${toolName}`);
      if (!existingTool) {
        return new Response(JSON.stringify({ error: 'Tool not found' }), { status: 404 });
      }

      await this.state.storage.delete(`tool:${ownerAgentId}:${toolName}`);

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
      console.error('[ToolRegistryDO] Delete error:', error);
      return new Response(JSON.stringify({
        error: 'Tool deletion failed',
        message: error.message || 'Unknown error'
      }), {
        status: 400,
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

      // Instead of direct D1 queries, Durable Objects should focus on their single-entity state.
      // This logic should ideally reside in the main Hono app or a separate service.
      return new Response(JSON.stringify({ error: 'Search operations are not supported directly in ToolRegistryDO. Use the main API for tool search.' }), { status: 501 });
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

  private async handleGetToolsByAgent(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // This logic should ideally reside in the main Hono app or a separate service.
      return new Response(JSON.stringify({ error: 'Get tools by agent operations are not supported directly in ToolRegistryDO. Use the main API for tool listing.' }), { status: 501 });
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
      // This logic should ideally reside in the main Hono app or a separate service.
      return new Response(JSON.stringify({ error: 'Get categories operations are not supported directly in ToolRegistryDO. Use the main API for category listing.' }), { status: 501 });
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

  // Helper methods (removed as they interact with DB/KV, which should be outside DO)
}
