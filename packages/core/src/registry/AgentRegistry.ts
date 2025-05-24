import { Env } from '../types/env';
import { generateApiKey, hashApiKey } from '../utils/crypto';
import { Agent, CreateAgentParams, CreateAgentResponse } from '../types/agent';
import { WalletService } from '../wallet/WalletService';

export class AgentRegistry {
  constructor(private env: Env) {}

  async createAgent(params: CreateAgentParams): Promise<CreateAgentResponse> {
    // Generate unique ID and API key
    const agentId = crypto.randomUUID();
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);

    // Store in D1
    await this.env.MARKETPLACE_DB.prepare(`
      INSERT INTO agents (id, name, owner_id, api_key_hash, reputation_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      agentId, 
      params.name, 
      params.ownerId, 
      apiKeyHash, 
      5.0, // Default reputation
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    // Create AgentState Durable Object
    const doId = this.env.AGENT_STATE.idFromString(agentId);
    const stub = this.env.AGENT_STATE.get(doId);
    
    await stub.fetch(new Request('http://do/register', {
      method: 'POST',
      body: JSON.stringify({
        id: agentId,
        name: params.name,
        owner: params.ownerId,
        description: params.description,
        tags: params.tags
      })
    }));

    // Create smart wallet for the agent
    const walletService = new WalletService(this.env);
    let wallet;
    try {
      wallet = await walletService.createSmartWallet({
        agentId,
        initialBalance: '100', // Start with 100 USDC
        sessionKeyConfig: {
          spendLimit: '10', // 10 USDC per session
          durationHours: 24,
          allowedContracts: []
        }
      });
      
      // Update agent record with wallet address
      await this.env.MARKETPLACE_DB.prepare(`
        UPDATE agents SET wallet_address = ? WHERE id = ?
      `).bind(wallet.address, agentId).run();
    } catch (error) {
      console.error('[AgentRegistry] Failed to create wallet:', error);
      // Continue without wallet - not critical for agent creation
    }

    return {
      agent: {
        id: agentId,
        name: params.name,
        ownerId: params.ownerId,
        reputationScore: 5.0,
        createdAt: new Date(),
        walletAddress: wallet?.address
      },
      apiKey // Return only once, user must save it
    };
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    const result = await this.env.MARKETPLACE_DB.prepare(`
      SELECT id, name, owner_id, reputation_score, created_at
      FROM agents
      WHERE id = ?
    `).bind(agentId).first();

    if (!result) return null;

    return {
      id: result.id as string,
      name: result.name as string,
      ownerId: result.owner_id as string,
      reputationScore: result.reputation_score as number,
      createdAt: new Date(result.created_at as string)
    };
  }

  async validateApiKey(apiKey: string): Promise<Agent | null> {
    const hash = await hashApiKey(apiKey);
    
    const result = await this.env.MARKETPLACE_DB.prepare(`
      SELECT id, name, owner_id, reputation_score, created_at
      FROM agents
      WHERE api_key_hash = ?
    `).bind(hash).first();

    if (!result) return null;

    return {
      id: result.id as string,
      name: result.name as string,
      ownerId: result.owner_id as string,
      reputationScore: result.reputation_score as number,
      createdAt: new Date(result.created_at as string)
    };
  }

  async updateAgentReputation(agentId: string, newScore: number): Promise<void> {
    await this.env.MARKETPLACE_DB.prepare(`
      UPDATE agents 
      SET reputation_score = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      Math.max(0, Math.min(10, newScore)), // Clamp between 0-10
      new Date().toISOString(),
      agentId
    ).run();
  }

  async listAgents(params: {
    limit?: number;
    offset?: number;
    search?: string;
    tags?: string[];
  }): Promise<{
    agents: Agent[];
    total: number;
  }> {
    const limit = params.limit || 20;
    const offset = params.offset || 0;
    
    let query = `
      SELECT id, name, owner_id, reputation_score, created_at
      FROM agents
      WHERE 1=1
    `;
    const bindings: any[] = [];

    if (params.search) {
      query += ` AND (name LIKE ? OR id LIKE ?)`;
      bindings.push(`%${params.search}%`, `%${params.search}%`);
    }

    query += ` ORDER BY reputation_score DESC, created_at DESC LIMIT ? OFFSET ?`;
    bindings.push(limit, offset);

    const results = await this.env.MARKETPLACE_DB.prepare(query).bind(...bindings).all();

    const agents = results.results?.map((row: any) => ({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      reputationScore: row.reputation_score,
      createdAt: new Date(row.created_at)
    })) || [];

    // Get total count
    const countQuery = params.search 
      ? `SELECT COUNT(*) as total FROM agents WHERE name LIKE ? OR id LIKE ?`
      : `SELECT COUNT(*) as total FROM agents`;
    
    const countBindings = params.search ? [`%${params.search}%`, `%${params.search}%`] : [];
    const countResult = await this.env.MARKETPLACE_DB.prepare(countQuery).bind(...countBindings).first();

    return {
      agents,
      total: (countResult?.total as number) || 0
    };
  }
}