import { BaseService } from './BaseService';
import { Task, CreateTaskParams } from '../types';

export class TaskService extends BaseService {
  /**
   * Create a new task
   */
  async create(params: CreateTaskParams): Promise<Task> {
    if (!this.config.apiKey) {
      throw new Error('API key is required to create tasks');
    }

    return this.request<Task>('POST', '/api/v1/tasks', {
      body: params
    });
  }

  /**
   * Get task details
   */
  async get(taskId: string): Promise<Task> {
    return this.request<Task>('GET', `/api/v1/tasks/${taskId}`);
  }

  /**
   * Accept a task
   */
  async accept(taskId: string): Promise<{ success: boolean }> {
    if (!this.config.apiKey) {
      throw new Error('API key is required to accept tasks');
    }

    return this.request('POST', `/api/v1/tasks/${taskId}/accept`);
  }

  /**
   * Complete a task
   */
  async complete(taskId: string, result: any): Promise<{ success: boolean }> {
    if (!this.config.apiKey) {
      throw new Error('API key is required to complete tasks');
    }

    return this.request('POST', `/api/v1/tasks/${taskId}/complete`, {
      body: { result }
    });
  }

  /**
   * Cancel a task
   */
  async cancel(taskId: string, reason?: string): Promise<{ success: boolean }> {
    if (!this.config.apiKey) {
      throw new Error('API key is required to cancel tasks');
    }

    return this.request('POST', `/api/v1/tasks/${taskId}/cancel`, {
      body: { reason }
    });
  }

  /**
   * Subscribe to task updates (WebSocket)
   */
  subscribeToUpdates(
    taskId: string,
    callbacks: {
      onStatusChange?: (status: Task['status']) => void;
      onComplete?: (result: any) => void;
      onError?: (error: Error) => void;
    }
  ): () => void {
    // WebSocket implementation would go here
    // For now, return a no-op unsubscribe function
    console.warn('WebSocket subscriptions not yet implemented');
    return () => {};
  }
}