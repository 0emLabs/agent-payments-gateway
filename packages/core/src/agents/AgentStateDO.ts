import { Env } from "../types/env";
import { AgentIdentity, RegisterAgentRequest, DepositRequest, WithdrawRequest, UpdateAgentRequest } from "@0emlabs/agent-payments-types";
import { generateApiKey, hashApiKey } from "../utils/crypto";

export class AgentStateDO implements DurableObject {
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
          return this.handleRegister(request);
        case '/balance':
          return this.handleBalance(request);
        case '/deposit':
          return this.handleDeposit(request);
        case '/withdraw':
          return this.handleWithdraw(request);
        case '/info':
          return this.handleGetInfo(request);
        case '/update':
          return this.handleUpdate(request);
        default:
          return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('[AgentStateDO] Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  private async handleRegister(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { name, description, tags } = await request.json() as RegisterAgentRequest;

      // Check if agent already exists
      const existingAgent = await this.state.storage.get<AgentIdentity>('agent');
      if (existingAgent) {
        return new Response(JSON.stringify({
          error: 'Agent already registered',
          agent: existingAgent
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Generate unique agent ID and API key
      const agentId = this.state.id.toString();
      const apiKey = generateApiKey();

      // Create wallet address (simplified - in production, use proper wallet generation)
      const walletAddress = `0x${crypto.randomUUID().replace(/-/g, '').substring(0, 40)}`;

      const agent: AgentIdentity = {
        id: agentId,
        api_key: await hashApiKey(apiKey),
        name,
        description,
        tags: tags || [],
        wallet: {
          address: walletAddress,
          balance: '0.00',
          currency: 'USDC'
        },
        createdAt: new Date().toISOString(), // Changed from created_at
        lastActive: new Date().toISOString(), // Changed from last_active
        status: 'active',
        ownerId: '', // Placeholder, will be set from X-User-Id header during agent creation in core
        reputationScore: 5.0 // Default value
      };

      await this.state.storage.put('agent', agent);

      // Store in marketplace database for discovery
      await this.storeInMarketplace(agent);

      return new Response(JSON.stringify({
        agent_id: agentId,
        api_key: apiKey, // Return raw API key only once
        wallet: agent.wallet,
        created_at: agent.createdAt // Using createdAt
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[AgentStateDO] Registration error:', error);
      return new Response(JSON.stringify({
        error: 'Registration failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleBalance(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const agent = await this.state.storage.get<AgentIdentity>('agent');
    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      balance: agent.wallet.balance,
      currency: agent.wallet.currency,
      wallet_address: agent.wallet.address
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleDeposit(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { amount, transaction_hash } = await request.json() as DepositRequest;

      if (!amount || !transaction_hash) {
        return new Response(JSON.stringify({
          error: 'Amount and transaction_hash required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const agent = await this.state.storage.get<AgentIdentity>('agent');
      if (!agent) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify the transaction (simplified - in production, verify on-chain)
      const verified = await this.verifyTransaction(transaction_hash, amount);
      if (!verified) {
        return new Response(JSON.stringify({
          error: 'Transaction verification failed'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update balance
      const currentBalance = parseFloat(agent.wallet.balance);
      const newBalance = currentBalance + parseFloat(amount);

      agent.wallet.balance = newBalance.toFixed(6);
      agent.lastActive = new Date().toISOString(); // Changed from last_active

      await this.state.storage.put('agent', agent);

      return new Response(JSON.stringify({
        success: true,
        new_balance: agent.wallet.balance,
        transaction_hash
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[AgentStateDO] Deposit error:', error);
      return new Response(JSON.stringify({
        error: 'Deposit failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleWithdraw(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { amount, to_address } = await request.json() as WithdrawRequest;

      if (!amount || !to_address) {
        return new Response(JSON.stringify({
          error: 'Amount and to_address required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const agent = await this.state.storage.get<AgentIdentity>('agent');
      if (!agent) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check balance
      const currentBalance = parseFloat(agent.wallet.balance);
      const withdrawAmount = parseFloat(amount);

      if (withdrawAmount > currentBalance) {
        return new Response(JSON.stringify({
          error: 'Insufficient balance'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Process withdrawal (simplified - in production, use proper on-chain transaction)
      const transactionHash = await this.processWithdrawal(agent.wallet.address, to_address, amount);

      // Update balance
      const newBalance = currentBalance - withdrawAmount;
      agent.wallet.balance = newBalance.toFixed(6);
      agent.lastActive = new Date().toISOString(); // Changed from last_active

      await this.state.storage.put('agent', agent);

      return new Response(JSON.stringify({
        success: true,
        new_balance: agent.wallet.balance,
        transaction_hash: transactionHash
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[AgentStateDO] Withdrawal error:', error);
      return new Response(JSON.stringify({
        error: 'Withdrawal failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleGetInfo(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const agent = await this.state.storage.get<AgentIdentity>('agent');
    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove sensitive information
    const publicInfo = {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      tags: agent.tags,
      wallet: {
        address: agent.wallet.address,
        balance: agent.wallet.balance,
        currency: agent.wallet.currency
      },
      createdAt: agent.createdAt, // Using createdAt
      lastActive: agent.lastActive, // Using lastActive
      status: agent.status
    };

    return new Response(JSON.stringify(publicInfo), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleUpdate(request: Request): Promise<Response> {
    if (request.method !== 'PUT') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const updates = await request.json() as UpdateAgentRequest;
      const agent = await this.state.storage.get<AgentIdentity>('agent');

      if (!agent) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update allowed fields
      if (updates.name !== undefined) agent.name = updates.name;
      if (updates.description !== undefined) agent.description = updates.description;
      if (updates.tags !== undefined) agent.tags = updates.tags;
      if (updates.status !== undefined) agent.status = updates.status;

      agent.lastActive = new Date().toISOString(); // Changed from last_active

      await this.state.storage.put('agent', agent);
      await this.storeInMarketplace(agent);

      return new Response(JSON.stringify({
        success: true,
        updated_at: agent.lastActive
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[AgentStateDO] Update error:', error);
      return new Response(JSON.stringify({
        error: 'Update failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Helper methods
  private async storeInMarketplace(agent: AgentIdentity): Promise<void> {
    try {
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        INSERT OR REPLACE INTO agents (id, name, owner_id, api_key_hash, wallet_address, reputation_score, created_at, last_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      await stmt.bind(
        agent.id,
        agent.name,
        agent.ownerId, // Assuming ownerId is available in AgentIdentity or derived
        agent.api_key,
        agent.wallet.address,
        agent.reputationScore || 5.0, // Default value if not present
        agent.createdAt, // Using createdAt
        agent.lastActive // Using lastActive
      ).run();
    } catch (error) {
      console.error('[AgentStateDO] Failed to store in marketplace:', error);
    }
  }

  private async verifyTransaction(txHash: string, amount: string): Promise<boolean> {
    // Simplified verification - in production, verify on-chain
    // This would check the transaction hash against the blockchain
    return true;
  }

  private async processWithdrawal(fromAddress: string, toAddress: string, amount: string): Promise<string> {
    // Simplified withdrawal - in production, create on-chain transaction
    return `0x${crypto.randomUUID().replace(/-/g, '')}`;
  }
}
