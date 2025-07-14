import { DurableObject } from "@cloudflare/workers-types";
import { Env, TaskRequest, AgentIdentity } from "../types/env";
import { generateTaskId, generateTransactionId } from "../utils/crypto";

interface TransactionState {
  task: TaskRequest;
  escrow_amount: string;
  platform_fee: string;
  started_at: string;
  expires_at: string;
  client_agent_state?: string; // DO ID for client agent
  tool_agent_state?: string;   // DO ID for tool agent
}

export class TransactionOrchestratorDO implements DurableObject {
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
        case '/create':
          return this.handleCreateTask(request);
        case '/accept':
          return this.handleAcceptTask(request);
        case '/complete':
          return this.handleCompleteTask(request);
        case '/cancel':
          return this.handleCancelTask(request);
        case '/status':
          return this.handleGetStatus(request);
        case '/timeout':
          return this.handleTimeout(request);
        default:
          return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  private async handleCreateTask(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { client_agent_id, tool_agent_id, task_details, payment_offer } = await request.json();

      if (!client_agent_id || !tool_agent_id || !task_details || !payment_offer) {
        return new Response(JSON.stringify({
          error: 'Missing required fields: client_agent_id, tool_agent_id, task_details, payment_offer'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if task already exists
      const existingTransaction = await this.state.storage.get<TransactionState>('transaction');
      if (existingTransaction) {
        return new Response(JSON.stringify({
          error: 'Transaction already exists',
          task_id: existingTransaction.task.id
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get client agent info and check balance
      const clientAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(client_agent_id));
      const clientResponse = await clientAgentState.fetch(new Request(`${this.env.API_BASE_URL}/balance`));

      if (!clientResponse.ok) {
        return new Response(JSON.stringify({
          error: 'Client agent not found or invalid'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const clientBalance = await clientResponse.json();
      const requiredAmount = parseFloat(payment_offer.amount);
      const platformFee = requiredAmount * 0.025; // 2.5% platform fee
      const totalRequired = requiredAmount + platformFee;

      if (parseFloat(clientBalance.balance) < totalRequired) {
        return new Response(JSON.stringify({
          error: 'Insufficient balance',
          required: totalRequired.toFixed(6),
          available: clientBalance.balance
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if tool agent exists
      const toolAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(tool_agent_id));
      const toolResponse = await toolAgentState.fetch(new Request(`${this.env.API_BASE_URL}/info`));

      if (!toolResponse.ok) {
        return new Response(JSON.stringify({
          error: 'Tool agent not found or invalid'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Create task
      const taskId = generateTaskId();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now

      const task: TaskRequest = {
        id: taskId,
        client_agent_id,
        tool_agent_id,
        task_details,
        payment_offer,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt
      };

      // Escrow the funds
      const escrowResult = await this.escrowFunds(client_agent_id, totalRequired.toFixed(6));
      if (!escrowResult.success) {
        return new Response(JSON.stringify({
          error: 'Failed to escrow funds',
          details: escrowResult.error
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Store transaction state
      const transactionState: TransactionState = {
        task,
        escrow_amount: totalRequired.toFixed(6),
        platform_fee: platformFee.toFixed(6),
        started_at: now,
        expires_at: expiresAt,
        client_agent_state: client_agent_id,
        tool_agent_state: tool_agent_id
      };

      await this.state.storage.put('transaction', transactionState);

      // Set expiration alarm
      await this.state.storage.setAlarm(new Date(expiresAt).getTime());

      // Log transaction in database
      await this.logTransaction(task, 'created');

      return new Response(JSON.stringify({
        task_id: taskId,
        status: 'pending',
        escrow_amount: totalRequired.toFixed(6),
        platform_fee: platformFee.toFixed(6),
        expires_at: expiresAt
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Create task error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to create task',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleAcceptTask(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { tool_agent_id } = await request.json();

      const transactionState = await this.state.storage.get<TransactionState>('transaction');
      if (!transactionState) {
        return new Response(JSON.stringify({ error: 'Transaction not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify the tool agent
      if (transactionState.task.tool_agent_id !== tool_agent_id) {
        return new Response(JSON.stringify({ error: 'Unauthorized tool agent' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if task is still pending
      if (transactionState.task.status !== 'pending') {
        return new Response(JSON.stringify({
          error: 'Task not in pending state',
          current_status: transactionState.task.status
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if task has expired
      if (new Date() > new Date(transactionState.expires_at)) {
        return new Response(JSON.stringify({ error: 'Task has expired' }), {
          status: 410,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update task status
      transactionState.task.status = 'in_progress';
      await this.state.storage.put('transaction', transactionState);

      // Log transaction update
      await this.logTransaction(transactionState.task, 'accepted');

      return new Response(JSON.stringify({
        task_id: transactionState.task.id,
        status: 'in_progress',
        task_details: transactionState.task.task_details,
        payment_offer: transactionState.task.payment_offer
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Accept task error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to accept task',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleCompleteTask(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { tool_agent_id, result } = await request.json();

      const transactionState = await this.state.storage.get<TransactionState>('transaction');
      if (!transactionState) {
        return new Response(JSON.stringify({ error: 'Transaction not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify the tool agent
      if (transactionState.task.tool_agent_id !== tool_agent_id) {
        return new Response(JSON.stringify({ error: 'Unauthorized tool agent' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if task is in progress
      if (transactionState.task.status !== 'in_progress') {
        return new Response(JSON.stringify({
          error: 'Task not in progress',
          current_status: transactionState.task.status
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Store result if provided
      if (result) {
        await this.state.storage.put('task_result', result);
      }

      // Process payment settlement
      const settlementResult = await this.settlePayment(transactionState);
      if (!settlementResult.success) {
        return new Response(JSON.stringify({
          error: 'Payment settlement failed',
          details: settlementResult.error
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update task status
      transactionState.task.status = 'completed';
      await this.state.storage.put('transaction', transactionState);

      // Clear expiration alarm
      await this.state.storage.deleteAlarm();

      // Log transaction completion
      await this.logTransaction(transactionState.task, 'completed');

      return new Response(JSON.stringify({
        task_id: transactionState.task.id,
        status: 'completed',
        settlement: settlementResult.details
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Complete task error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to complete task',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleCancelTask(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { client_agent_id, reason } = await request.json();

      const transactionState = await this.state.storage.get<TransactionState>('transaction');
      if (!transactionState) {
        return new Response(JSON.stringify({ error: 'Transaction not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify the client agent
      if (transactionState.task.client_agent_id !== client_agent_id) {
        return new Response(JSON.stringify({ error: 'Unauthorized client agent' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if task can be cancelled
      if (transactionState.task.status === 'completed') {
        return new Response(JSON.stringify({
          error: 'Cannot cancel completed task'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Return escrowed funds
      const refundResult = await this.refundEscrow(transactionState);
      if (!refundResult.success) {
        return new Response(JSON.stringify({
          error: 'Failed to refund escrow',
          details: refundResult.error
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update task status
      transactionState.task.status = 'cancelled';
      await this.state.storage.put('transaction', transactionState);

      // Clear expiration alarm
      await this.state.storage.deleteAlarm();

      // Log transaction cancellation
      await this.logTransaction(transactionState.task, 'cancelled', reason);

      return new Response(JSON.stringify({
        task_id: transactionState.task.id,
        status: 'cancelled',
        refund_amount: transactionState.escrow_amount
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Cancel task error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to cancel task',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleGetStatus(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const transactionState = await this.state.storage.get<TransactionState>('transaction');
    if (!transactionState) {
      return new Response(JSON.stringify({ error: 'Transaction not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await this.state.storage.get('task_result');

    return new Response(JSON.stringify({
      task: transactionState.task,
      escrow_amount: transactionState.escrow_amount,
      platform_fee: transactionState.platform_fee,
      result: result || null
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleTimeout(request: Request): Promise<Response> {
    // Handle task timeout (called by alarm)
    const transactionState = await this.state.storage.get<TransactionState>('transaction');
    if (!transactionState) {
      return new Response('Transaction not found', { status: 404 });
    }

    if (transactionState.task.status === 'pending' || transactionState.task.status === 'in_progress') {
      // Refund escrow
      await this.refundEscrow(transactionState);

      // Update status
      transactionState.task.status = 'cancelled';
      await this.state.storage.put('transaction', transactionState);

      // Log timeout
      await this.logTransaction(transactionState.task, 'timeout');
    }

    return new Response('OK', { status: 200 });
  }

  // Alarm handler for task expiration
  async alarm(): Promise<void> {
    console.log('[TransactionOrchestratorDO] Alarm triggered - handling task timeout');
    await this.handleTimeout(new Request('https://dummy.com/timeout'));
  }

  // Helper methods
  private async escrowFunds(clientAgentId: string, amount: string): Promise<{success: boolean, error?: string}> {
    try {
      const clientAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(clientAgentId));

      // Simulate escrow by deducting from client balance
      const response = await clientAgentState.fetch(new Request(`${this.env.API_BASE_URL}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          to_address: 'escrow_' + this.state.id.toString()
        })
      }));

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Unknown error' };
      }

      return { success: true };
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Escrow error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async settlePayment(transactionState: TransactionState): Promise<{success: boolean, error?: string, details?: any}> {
    try {
      const paymentAmount = parseFloat(transactionState.task.payment_offer.amount);
      const platformFee = parseFloat(transactionState.platform_fee);

      // Credit tool agent
      const toolAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(transactionState.task.tool_agent_id));
      const toolResponse = await toolAgentState.fetch(new Request(`${this.env.API_BASE_URL}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: paymentAmount.toFixed(6),
          transaction_hash: generateTransactionId()
        })
      }));

      if (!toolResponse.ok) {
        const error = await toolResponse.json();
        return { success: false, error: error.error || 'Failed to credit tool agent' };
      }

      // Credit platform fee wallet (simplified)
      // In production, this would credit the platform's actual wallet

      return {
        success: true,
        details: {
          tool_agent_credited: paymentAmount.toFixed(6),
          platform_fee_collected: platformFee.toFixed(6),
          total_settled: (paymentAmount + platformFee).toFixed(6)
        }
      };
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Settlement error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async refundEscrow(transactionState: TransactionState): Promise<{success: boolean, error?: string}> {
    try {
      const clientAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(transactionState.task.client_agent_id));

      const response = await clientAgentState.fetch(new Request(`${this.env.API_BASE_URL}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: transactionState.escrow_amount,
          transaction_hash: generateTransactionId()
        })
      }));

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to refund escrow' };
      }

      return { success: true };
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Refund error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async logTransaction(task: TaskRequest, action: string, details?: string): Promise<void> {
    try {
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        INSERT INTO transaction_logs (task_id, action, details, timestamp, client_agent_id, tool_agent_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      await stmt.bind(
        task.id,
        action,
        details || null,
        new Date().toISOString(),
        task.client_agent_id,
        task.tool_agent_id
      ).run();
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Failed to log transaction:', error);
    }
  }
}
