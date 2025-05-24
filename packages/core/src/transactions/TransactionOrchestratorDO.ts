import { DurableObjectState } from "@cloudflare/workers-types";
import { Env } from "../types/env";
import { CreateTaskParams, TaskStatus } from "@0emlabs/agent-payments-types";
import { generateTaskId, generateTransactionId } from "../utils/crypto";
import { EscrowService } from "../escrow/EscrowService";

interface TransactionState {
  task: CreateTaskParams; // Changed from TaskRequest
  escrow_amount: string;
  platform_fee: string;
  escrow_id?: string; // ID for escrow tracking
  started_at: string;
  expires_at: string;
  client_agent_state?: string; // DO ID for client agent
  tool_agent_state?: string;   // DO ID for tool agent
  status: TaskStatus; // Add status to TransactionState to mirror TaskStatus more closely
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
      const params = await request.json() as CreateTaskParams;

      if (!params.fromAgentId || !params.toAgentId || !params.payload || !params.payment) {
        return new Response(JSON.stringify({
          error: 'Missing required fields: fromAgentId, toAgentId, payload, payment'
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
          task_id: existingTransaction.task.payload.id || 'unknown' // Use payload.id as task id
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get client agent info and check balance
      const clientAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(params.fromAgentId));
      // Use CFRequest for the internal fetch call to match DurableObject's fetch signature more closely
      const clientResponse = await clientAgentState.fetch(new Request(`${this.env.API_BASE_URL}/api/v1/agents/${params.fromAgentId}/wallet`));

      if (!clientResponse.ok) {
        return new Response(JSON.stringify({
          error: 'Client agent not found or invalid balance info',
          details: await clientResponse.text() // Provide more details from the response
        }), {
          status: clientResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const clientBalance = await clientResponse.json() as { balance: string };
      const requiredAmount = parseFloat(params.payment.amount);
      // Ensure PLATFORM_FEE_PERCENT is a valid number, default to 0.025 if not defined or invalid
      const platformFeePercent = parseFloat(this.env.PLATFORM_FEE_PERCENT || '0.025');
      const platformFee = requiredAmount * platformFeePercent;
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
      const toolAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(params.toAgentId));
      // Use CFRequest for the internal fetch call
      const toolResponse = await toolAgentState.fetch(new Request(`${this.env.API_BASE_URL}/api/v1/agents/${params.toAgentId}`));

      if (!toolResponse.ok) {
        return new Response(JSON.stringify({
          error: 'Tool agent not found or invalid',
          details: await toolResponse.text()
        }), {
          status: toolResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Create escrow for the task
      const escrowService = new EscrowService(this.env);
      let escrowResult;
      
      try {
        // Extract task description from payload
        const taskDescription = typeof params.payload === 'string' 
          ? params.payload 
          : JSON.stringify(params.payload);
        
        // Use model from payment metadata or default
        const model = params.payment.metadata?.model || 'gpt-4';
        
        escrowResult = await escrowService.createEscrow({
          fromAgentId: params.fromAgentId,
          toAgentId: params.toAgentId,
          taskDescription,
          model,
          estimatedCost: requiredAmount
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: 'Failed to create escrow',
          details: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Create task
      const taskId = generateTaskId();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now

      // Store transaction state with CreateTaskParams
      const transactionState: TransactionState = {
        task: params, // Store the incoming params directly
        escrow_amount: escrowResult.lockedAmount,
        platform_fee: platformFee.toFixed(6),
        escrow_id: escrowResult.escrowId,
        started_at: now,
        expires_at: expiresAt,
        client_agent_state: params.fromAgentId,
        tool_agent_state: params.toAgentId,
        status: 'pending' // Initialize status
      };

      await this.state.storage.put('transaction', transactionState);

      // Set expiration alarm
      await this.state.storage.setAlarm(new Date(expiresAt).getTime());

      // Log transaction in database
      await this.logTransaction(params, 'created'); // Pass params (CreateTaskParams)

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
      const { tool_agent_id } = await request.json() as { tool_agent_id: string };

      const transactionState = await this.state.storage.get<TransactionState>('transaction');
      if (!transactionState) {
        return new Response(JSON.stringify({ error: 'Transaction not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify the tool agent
      if (transactionState.task.toAgentId !== tool_agent_id) { // Access toAgentId from task (CreateTaskParams)
        return new Response(JSON.stringify({ error: 'Unauthorized tool agent' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if task is still pending
      if (transactionState.status !== 'pending') { // Use transactionState.status
        return new Response(JSON.stringify({
          error: 'Task not in pending state',
          current_status: transactionState.status
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
      transactionState.status = 'in_progress';
      await this.state.storage.put('transaction', transactionState);

      // Log transaction update
      await this.logTransaction(transactionState.task, 'accepted');

      return new Response(JSON.stringify({
        task_id: transactionState.task.payload.id || 'unknown', // Use payload.id as task id
        status: 'in_progress',
        task_details: transactionState.task.payload, // Use payload
        payment_offer: transactionState.task.payment
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
      const { tool_agent_id, result } = await request.json() as { tool_agent_id: string; result: any };

      const transactionState = await this.state.storage.get<TransactionState>('transaction');
      if (!transactionState) {
        return new Response(JSON.stringify({ error: 'Transaction not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify the tool agent
      if (transactionState.task.toAgentId !== tool_agent_id) { // Access toAgentId from task (CreateTaskParams)
        return new Response(JSON.stringify({ error: 'Unauthorized tool agent' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if task is in progress
      if (transactionState.status !== 'in_progress') { // Use transactionState.status
        return new Response(JSON.stringify({
          error: 'Task not in progress',
          current_status: transactionState.status
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
      transactionState.status = 'completed';
      await this.state.storage.put('transaction', transactionState);

      // Clear expiration alarm
      await this.state.storage.deleteAlarm();

      // Log transaction completion
      await this.logTransaction(transactionState.task, 'completed');

      return new Response(JSON.stringify({
        task_id: transactionState.task.payload.id || 'unknown', // Use payload.id as task id
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
      const { client_agent_id, reason } = await request.json() as { client_agent_id: string; reason?: string };

      const transactionState = await this.state.storage.get<TransactionState>('transaction');
      if (!transactionState) {
        return new Response(JSON.stringify({ error: 'Transaction not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Verify the client agent
      if (transactionState.task.fromAgentId !== client_agent_id) { // Use fromAgentId
        return new Response(JSON.stringify({ error: 'Unauthorized client agent' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if task can be cancelled
      if (transactionState.status === 'completed') { // Use transactionState.status
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
      transactionState.status = 'cancelled';
      await this.state.storage.put('transaction', transactionState);

      // Clear expiration alarm
      await this.state.storage.deleteAlarm();

      // Log transaction cancellation
      await this.logTransaction(transactionState.task, 'cancelled', reason);

      return new Response(JSON.stringify({
        task_id: transactionState.task.payload.id || 'unknown', // Use payload.id as task id
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
      status: transactionState.status, // Include status
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

    if (transactionState.status === 'pending' || transactionState.status === 'in_progress') {
      // Refund escrow
      await this.refundEscrow(transactionState);

      // Update status
      transactionState.status = 'cancelled';
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

  private async settlePayment(transactionState: TransactionState): Promise<{success: boolean, error?: string, details?: any}> {
    try {
      const paymentAmount = parseFloat(transactionState.task.payment.amount); // Access payment.amount
      const platformFee = parseFloat(transactionState.platform_fee);

      // Use escrow service to release funds
      if (transactionState.escrow_id) {
        const escrowService = new EscrowService(this.env);
        
        // Get actual token usage from result (this would come from the tool agent's response)
        // For now, we'll use the estimated values
        const taskResult = await this.state.storage.get('task_result');
        const actualTokens = taskResult?.tokenUsage?.totalTokens || 0;
        const actualCost = taskResult?.tokenUsage?.totalCost || paymentAmount;
        
        const releaseResult = await escrowService.releaseEscrow({
          escrowId: transactionState.escrow_id,
          actualTokens,
          actualCost
        });

        if (!releaseResult.success) {
          return { success: false, error: releaseResult.error };
        }

        // Credit platform fee wallet if needed
        if (this.env.PLATFORM_FEE_WALLET && platformFee > 0) {
          const platformFeeWalletState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(this.env.PLATFORM_FEE_WALLET));
          const platformFeeResponse = await platformFeeWalletState.fetch(new Request(`${this.env.API_BASE_URL}/api/v1/agents/${this.env.PLATFORM_FEE_WALLET}/wallet/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: platformFee.toFixed(6),
              transaction_hash: generateTransactionId()
            })
          }));
          if (!platformFeeResponse.ok) {
            const error: any = await platformFeeResponse.json();
            console.error('[TransactionOrchestratorDO] Failed to collect platform fee:', error.error || error.message);
          }
        }

        return {
          success: true,
          details: {
            tool_agent_credited: actualCost.toFixed(6),
            platform_fee_collected: platformFee.toFixed(6),
            total_settled: (actualCost + platformFee).toFixed(6),
            refunded: releaseResult.refundAmount || '0'
          }
        };
      } else {
        // Fallback to original logic if no escrow
        const toolAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(transactionState.task.toAgentId));
        const toolResponse = await toolAgentState.fetch(new Request(`${this.env.API_BASE_URL}/api/v1/agents/${transactionState.task.toAgentId}/wallet/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: paymentAmount.toFixed(6),
            transaction_hash: generateTransactionId()
          })
        }));

        if (!toolResponse.ok) {
          const error: any = await toolResponse.json();
          return { success: false, error: error.error || 'Failed to credit tool agent' };
        }

        return {
          success: true,
          details: {
            tool_agent_credited: paymentAmount.toFixed(6),
            platform_fee_collected: platformFee.toFixed(6),
            total_settled: (paymentAmount + platformFee).toFixed(6)
          }
        };
      }
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Settlement error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async refundEscrow(transactionState: TransactionState): Promise<{success: boolean, error?: string}> {
    try {
      if (transactionState.escrow_id) {
        const escrowService = new EscrowService(this.env);
        const cancelResult = await escrowService.cancelEscrow(
          transactionState.escrow_id,
          'Task cancelled or expired'
        );
        
        return cancelResult;
      } else {
        // Fallback to original logic if no escrow
        const clientAgentState = this.env.AGENT_STATE.get(this.env.AGENT_STATE.idFromString(transactionState.task.fromAgentId));

        const response = await clientAgentState.fetch(new Request(`${this.env.API_BASE_URL}/api/v1/agents/${transactionState.task.fromAgentId}/wallet/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: transactionState.escrow_amount,
            transaction_hash: generateTransactionId()
          })
        }));

        if (!response.ok) {
          const error: any = await response.json();
          return { success: false, error: error.error || 'Failed to refund escrow' };
        }

        return { success: true };
      }
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Refund error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async logTransaction(task: CreateTaskParams, action: string, details?: string): Promise<void> { // Changed task to CreateTaskParams
    try {
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        INSERT INTO transaction_logs (task_id, action, details, timestamp, client_agent_id, tool_agent_id, amount, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      await stmt.bind(
        task.payload.id || 'unknown', // Use payload.id for task_id
        action,
        details || null,
        new Date().toISOString(),
        task.fromAgentId,
        task.toAgentId,
        task.payment.amount,
        task.payment.currency
      ).run();
    } catch (error) {
      console.error('[TransactionOrchestratorDO] Failed to log transaction:', error);
    }
  }
}
