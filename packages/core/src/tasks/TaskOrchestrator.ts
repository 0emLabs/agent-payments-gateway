import { Env } from '../types/env';
import { Task, CreateTaskParams, TaskStatus } from '@0emlabs/agent-payments-types'; // Import TaskStatus from types package
import { generateTaskId } from '../utils/crypto';

export class TaskOrchestrator {
  constructor(private env: Env) {}

  async createTask(params: CreateTaskParams): Promise<Task> {
    const taskId = generateTaskId();

    // Create a new TransactionOrchestrator DO for this task
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);

    // Send the create request to the DO
    const response = await orchestrator.fetch(new Request('http://do/create', {
      method: 'POST',
      body: JSON.stringify({
        client_agent_id: params.fromAgentId,
        tool_agent_id: params.toAgentId,
        task_details: params.payload,
        payment_offer: params.payment
      })
    }));

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string }; // Explicit type assertion
      throw new Error(error.error || error.message || 'Failed to create task');
    }

    const result = await response.json() as { task_id: string; expires_at: string }; // Explicit type assertion

    return {
      id: result.task_id,
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      status: 'pending' as TaskStatus,
      payload: params.payload,
      payment: params.payment,
      createdAt: new Date(),
      expiresAt: new Date(result.expires_at)
    };
  }

  async getTaskStatus(taskId: string): Promise<Task | null> {
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);

    const response = await orchestrator.fetch(new Request('http://do/status', {
      method: 'GET'
    }));

    if (!response.ok) {
      return null;
    }

    const result = await response.json() as {
      task: {
        id: string;
        client_agent_id: string;
        tool_agent_id: string;
        status: TaskStatus;
        task_details: unknown;
        payment_offer: { amount: string; currency: 'USDC'; };
        created_at: string;
        expires_at: string;
        completed_at?: string;
      };
      escrow_amount: string;
      platform_fee: string;
      status: TaskStatus; // Added status here to match TransactionOrchestratorDO response
      result?: unknown; // Task result can be any
    }; // Explicit type assertion

    return {
      id: result.task.id,
      fromAgentId: result.task.client_agent_id,
      toAgentId: result.task.tool_agent_id,
      status: result.status, // Use status from the top-level of the result
      payload: result.task.task_details,
      payment: result.task.payment_offer,
      createdAt: new Date(result.task.created_at),
      expiresAt: new Date(result.task.expires_at),
      completedAt: result.task.completed_at ? new Date(result.task.completed_at) : undefined
    };
  }

  async acceptTask(taskId: string, toolAgentId: string): Promise<void> {
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);

    const response = await orchestrator.fetch(new Request('http://do/accept', {
      method: 'POST',
      body: JSON.stringify({ tool_agent_id: toolAgentId })
    }));

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string }; // Explicit type assertion
      throw new Error(error.error || error.message || 'Failed to accept task');
    }
  }

  async completeTask(taskId: string, toolAgentId: string, result?: unknown): Promise<void> {
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);

    const response = await orchestrator.fetch(new Request('http://do/complete', {
      method: 'POST',
      body: JSON.stringify({
        tool_agent_id: toolAgentId,
        result
      })
    }));

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string }; // Explicit type assertion
      throw new Error(error.error || error.message || 'Failed to complete task');
    }
  }

  async cancelTask(taskId: string, clientAgentId: string, reason?: string): Promise<void> {
    const orchestratorId = this.env.TRANSACTION_ORCHESTRATOR.idFromString(taskId);
    const orchestrator = this.env.TRANSACTION_ORCHESTRATOR.get(orchestratorId);

    const response = await orchestrator.fetch(new Request('http://do/cancel', {
      method: 'POST',
      body: JSON.stringify({
        client_agent_id: clientAgentId,
        reason
      })
    }));

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string }; // Explicit type assertion
      throw new Error(error.error || error.message || 'Failed to cancel task');
    }
  }

  async getAgentTasks(agentId: string, role: 'client' | 'tool' = 'client'): Promise<Task[]> {
    const column = role === 'client' ? 'client_agent_id' : 'tool_agent_id';

    // Ensure marketplace_db is available and has transaction_logs table
    if (!this.env.MARKETPLACE_DB) {
      console.warn('MARKETPLACE_DB is not available for getAgentTasks.');
      return [];
    }

    const results = await this.env.MARKETPLACE_DB.prepare(`
      SELECT task_id, client_agent_id, tool_agent_id, status, created_at, completed_at
      FROM transaction_logs
      WHERE ${column} = ? AND action = 'created'
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(agentId).all();

    // For each task, get full details from the orchestrator
    const tasks: Task[] = [];

    for (const log of results.results || []) {
      // Assuming log.task_id is string and log.status exists from the DB query
      const taskDetails = log as { task_id: string, client_agent_id: string, tool_agent_id: string, status: TaskStatus, created_at: string, completed_at?: string };

      const task = await this.getTaskStatus(taskDetails.task_id);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }
}
