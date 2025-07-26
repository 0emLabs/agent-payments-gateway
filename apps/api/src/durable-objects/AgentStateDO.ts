import { DurableObject } from 'cloudflare:workers';

interface AgentWallet {
  address: string;
  type: 'custodial' | 'smart-wallet';
  chain: string;
  balance: {
    USDC: number;
    ETH: number;
  };
}

interface AgentData {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'suspended';
  wallet: AgentWallet;
  metadata: Record<string, any>;
  stats: {
    total_tasks_requested: number;
    total_tasks_completed: number;
    total_spent: number;
    total_earned: number;
    average_rating?: number;
  };
  created_at: string;
  updated_at: string;
}

export class AgentStateDO extends DurableObject {
  private agent: AgentData | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/create':
          return await this.handleCreate(request);
        case '/get':
          return await this.handleGet();
        case '/update':
          return await this.handleUpdate(request);
        case '/wallet/balance':
          return await this.handleGetBalance();
        case '/wallet/update-balance':
          return await this.handleUpdateBalance(request);
        case '/stats/increment':
          return await this.handleIncrementStats(request);
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      console.error('AgentState error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleCreate(request: Request): Promise<Response> {
    if (this.agent) {
      return new Response(JSON.stringify({
        error: 'Agent already exists'
      }), { status: 400 });
    }

    const data = await request.json();
    
    // Generate wallet address (in production, use proper key derivation)
    const walletAddress = `0x${crypto.randomUUID().replace(/-/g, '').substring(0, 40)}`;
    
    this.agent = {
      id: data.id,
      name: data.name,
      description: data.description,
      status: 'active',
      wallet: {
        address: walletAddress,
        type: data.wallet?.type || 'custodial',
        chain: data.wallet?.chain || 'base',
        balance: {
          USDC: 0,
          ETH: 0
        }
      },
      metadata: data.metadata || {},
      stats: {
        total_tasks_requested: 0,
        total_tasks_completed: 0,
        total_spent: 0,
        total_earned: 0
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Persist state
    await this.ctx.storage.put('agent', this.agent);

    return new Response(JSON.stringify({
      success: true,
      agent: this.agent
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGet(): Promise<Response> {
    // Load from storage if not in memory
    if (!this.agent) {
      this.agent = await this.ctx.storage.get('agent');
    }

    if (!this.agent) {
      return new Response(JSON.stringify({
        error: 'Agent not found'
      }), { status: 404 });
    }

    return new Response(JSON.stringify(this.agent), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleUpdate(request: Request): Promise<Response> {
    if (!this.agent) {
      this.agent = await this.ctx.storage.get('agent');
    }

    if (!this.agent) {
      return new Response(JSON.stringify({
        error: 'Agent not found'
      }), { status: 404 });
    }

    const updates = await request.json();
    
    // Apply updates
    if (updates.name) this.agent.name = updates.name;
    if (updates.description !== undefined) this.agent.description = updates.description;
    if (updates.status) this.agent.status = updates.status;
    if (updates.metadata) {
      this.agent.metadata = { ...this.agent.metadata, ...updates.metadata };
    }
    
    this.agent.updated_at = new Date().toISOString();
    
    // Persist changes
    await this.ctx.storage.put('agent', this.agent);

    return new Response(JSON.stringify({
      success: true,
      agent: this.agent
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetBalance(): Promise<Response> {
    if (!this.agent) {
      this.agent = await this.ctx.storage.get('agent');
    }

    if (!this.agent) {
      return new Response(JSON.stringify({
        error: 'Agent not found'
      }), { status: 404 });
    }

    // In production, this would query the actual blockchain
    // For now, return the stored balance
    return new Response(JSON.stringify({
      wallet_address: this.agent.wallet.address,
      chain: this.agent.wallet.chain,
      balance: this.agent.wallet.balance
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleUpdateBalance(request: Request): Promise<Response> {
    if (!this.agent) {
      this.agent = await this.ctx.storage.get('agent');
    }

    if (!this.agent) {
      return new Response(JSON.stringify({
        error: 'Agent not found'
      }), { status: 404 });
    }

    const { currency, amount, operation } = await request.json();
    
    if (!['USDC', 'ETH'].includes(currency)) {
      return new Response(JSON.stringify({
        error: 'Invalid currency'
      }), { status: 400 });
    }

    if (!['add', 'subtract', 'set'].includes(operation)) {
      return new Response(JSON.stringify({
        error: 'Invalid operation'
      }), { status: 400 });
    }

    // Update balance
    switch (operation) {
      case 'add':
        this.agent.wallet.balance[currency] += amount;
        break;
      case 'subtract':
        if (this.agent.wallet.balance[currency] < amount) {
          return new Response(JSON.stringify({
            error: 'Insufficient balance'
          }), { status: 400 });
        }
        this.agent.wallet.balance[currency] -= amount;
        break;
      case 'set':
        this.agent.wallet.balance[currency] = amount;
        break;
    }

    this.agent.updated_at = new Date().toISOString();
    await this.ctx.storage.put('agent', this.agent);

    return new Response(JSON.stringify({
      success: true,
      new_balance: this.agent.wallet.balance
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleIncrementStats(request: Request): Promise<Response> {
    if (!this.agent) {
      this.agent = await this.ctx.storage.get('agent');
    }

    if (!this.agent) {
      return new Response(JSON.stringify({
        error: 'Agent not found'
      }), { status: 404 });
    }

    const { stat, value = 1 } = await request.json();
    
    const validStats = [
      'total_tasks_requested',
      'total_tasks_completed',
      'total_spent',
      'total_earned'
    ];

    if (!validStats.includes(stat)) {
      return new Response(JSON.stringify({
        error: 'Invalid stat'
      }), { status: 400 });
    }

    // Increment stat
    this.agent.stats[stat] += value;
    this.agent.updated_at = new Date().toISOString();
    
    await this.ctx.storage.put('agent', this.agent);

    return new Response(JSON.stringify({
      success: true,
      stats: this.agent.stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async alarm(): Promise<void> {
    // Could be used for periodic tasks like:
    // - Checking wallet balance on-chain
    // - Updating reputation scores
    // - Cleaning up old data
  }
}