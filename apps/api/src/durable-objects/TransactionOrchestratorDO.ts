import { DurableObject } from 'cloudflare:workers';

interface TransactionState {
  taskId: string;
  fromAgentId: string;
  toAgentId: string;
  toolName: string;
  parameters: Record<string, any>;
  payment?: {
    amount: number;
    currency: string;
    chain: string;
  };
  escrow?: {
    id: string;
    amount: number;
    status: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export class TransactionOrchestratorDO extends DurableObject {
  private state: TransactionState | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/init':
          return await this.handleInit(request);
        case '/execute':
          return await this.handleExecute(request);
        case '/status':
          return await this.handleStatus();
        case '/result':
          return await this.handleResult();
        case '/cancel':
          return await this.handleCancel(request);
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      console.error('TransactionOrchestrator error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    if (this.state) {
      return new Response(JSON.stringify({
        error: 'Transaction already initialized'
      }), { status: 400 });
    }

    const data = await request.json();
    
    this.state = {
      taskId: data.taskId,
      fromAgentId: data.fromAgentId,
      toAgentId: data.toAgentId,
      toolName: data.toolName,
      parameters: data.parameters,
      payment: data.payment,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store state
    await this.ctx.storage.put('state', this.state);

    return new Response(JSON.stringify({
      success: true,
      taskId: this.state.taskId
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleExecute(request: Request): Promise<Response> {
    if (!this.state) {
      return new Response(JSON.stringify({
        error: 'Transaction not initialized'
      }), { status: 400 });
    }

    if (this.state.status !== 'pending') {
      return new Response(JSON.stringify({
        error: `Cannot execute transaction in ${this.state.status} status`
      }), { status: 400 });
    }

    try {
      // Update status
      this.state.status = 'processing';
      this.state.updatedAt = new Date().toISOString();
      await this.ctx.storage.put('state', this.state);

      // Step 1: Create escrow if payment is required
      if (this.state.payment) {
        const escrowResponse = await this.createEscrow();
        if (!escrowResponse.success) {
          throw new Error('Failed to create escrow');
        }
        this.state.escrow = escrowResponse.escrow;
        await this.ctx.storage.put('state', this.state);
      }

      // Step 2: Execute the tool
      const toolResult = await this.executeTool();
      
      // Step 3: Release escrow on success
      if (this.state.escrow) {
        const releaseResponse = await this.releaseEscrow('provider');
        if (!releaseResponse.success) {
          console.error('Failed to release escrow:', releaseResponse);
        }
      }

      // Update final state
      this.state.status = 'completed';
      this.state.result = toolResult;
      this.state.completedAt = new Date().toISOString();
      this.state.updatedAt = new Date().toISOString();
      await this.ctx.storage.put('state', this.state);

      return new Response(JSON.stringify({
        success: true,
        status: this.state.status,
        result: this.state.result,
        payment: this.state.payment,
        escrow: this.state.escrow
      }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // Handle failure
      this.state.status = 'failed';
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
      this.state.updatedAt = new Date().toISOString();
      await this.ctx.storage.put('state', this.state);

      // Refund escrow if it exists
      if (this.state.escrow) {
        await this.releaseEscrow('payer');
      }

      return new Response(JSON.stringify({
        success: false,
        status: this.state.status,
        error: this.state.error
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleStatus(): Promise<Response> {
    if (!this.state) {
      return new Response(JSON.stringify({
        error: 'Transaction not found'
      }), { status: 404 });
    }

    return new Response(JSON.stringify(this.state), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleResult(): Promise<Response> {
    if (!this.state) {
      return new Response(JSON.stringify({
        error: 'Transaction not found'
      }), { status: 404 });
    }

    if (this.state.status !== 'completed') {
      return new Response(JSON.stringify({
        error: `Transaction not completed. Current status: ${this.state.status}`
      }), { status: 400 });
    }

    return new Response(JSON.stringify({
      taskId: this.state.taskId,
      result: this.state.result,
      completedAt: this.state.completedAt
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleCancel(request: Request): Promise<Response> {
    if (!this.state) {
      return new Response(JSON.stringify({
        error: 'Transaction not found'
      }), { status: 404 });
    }

    if (this.state.status === 'completed' || this.state.status === 'cancelled') {
      return new Response(JSON.stringify({
        error: `Cannot cancel transaction in ${this.state.status} status`
      }), { status: 400 });
    }

    const { reason } = await request.json();

    // Cancel escrow if exists
    if (this.state.escrow && this.state.escrow.status === 'locked') {
      await this.releaseEscrow('payer');
    }

    this.state.status = 'cancelled';
    this.state.error = reason || 'Cancelled by user';
    this.state.updatedAt = new Date().toISOString();
    await this.ctx.storage.put('state', this.state);

    return new Response(JSON.stringify({
      success: true,
      task: this.state
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async createEscrow(): Promise<any> {
    // In production, this would call the actual escrow service
    // For now, return mock success
    return {
      success: true,
      escrow: {
        id: crypto.randomUUID(),
        amount: this.state!.payment!.amount,
        status: 'locked'
      }
    };
  }

  private async releaseEscrow(releaseTo: 'provider' | 'payer'): Promise<any> {
    // In production, this would call the actual escrow service
    // For now, return mock success
    if (this.state?.escrow) {
      this.state.escrow.status = releaseTo === 'provider' ? 'released' : 'refunded';
      await this.ctx.storage.put('state', this.state);
    }
    
    return {
      success: true
    };
  }

  private async executeTool(): Promise<any> {
    // In production, this would:
    // 1. Look up the tool from the registry
    // 2. Validate parameters against the tool schema
    // 3. Call the tool endpoint
    // 4. Return the result
    
    // For now, return mock success
    return {
      success: true,
      output: `Executed ${this.state!.toolName} successfully`,
      metadata: {
        execution_time_ms: 150,
        tokens_used: 100
      }
    };
  }

  async alarm(): Promise<void> {
    // Handle timeouts and auto-release
    if (this.state && this.state.status === 'processing') {
      // Check if timeout exceeded
      const createdAt = new Date(this.state.createdAt);
      const now = new Date();
      const timeoutMs = 30000; // 30 seconds default
      
      if (now.getTime() - createdAt.getTime() > timeoutMs) {
        this.state.status = 'failed';
        this.state.error = 'Transaction timeout';
        this.state.updatedAt = new Date().toISOString();
        await this.ctx.storage.put('state', this.state);
        
        // Refund escrow
        if (this.state.escrow) {
          await this.releaseEscrow('payer');
        }
      }
    }
  }
}