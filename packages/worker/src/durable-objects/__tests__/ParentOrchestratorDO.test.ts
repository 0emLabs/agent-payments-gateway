import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParentOrchestratorDO } from '../ParentOrchestratorDO';
import { createMockEnv, createMockDurableObjectState } from '../../test/testHelpers';
import { TaskState, SubTask } from '../../types/task';

// Mock dependencies
vi.mock('../../lib/taskDecomposer', () => ({
  TaskDecomposer: vi.fn().mockImplementation(() => ({
    decompose: vi.fn().mockResolvedValue([
      { toolName: 'web_search', parameters: { query: 'test' }, description: 'Search for test' },
      { toolName: 'analyze_data', parameters: { data: 'test' }, description: 'Analyze test data' }
    ])
  }))
}));

vi.mock('../../lib/resultSynthesizer', () => ({
  ResultSynthesizer: vi.fn().mockImplementation(() => ({
    synthesize: vi.fn().mockResolvedValue('Synthesized result based on all sub-tasks')
  }))
}));

describe('ParentOrchestratorDO', () => {
  let orchestrator: ParentOrchestratorDO;
  let mockEnv: ReturnType<typeof createMockEnv>;
  let mockState: ReturnType<typeof createMockDurableObjectState>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
    mockState = createMockDurableObjectState();
    orchestrator = new ParentOrchestratorDO(mockState as any, mockEnv as any);
    
    // Mock fetch globally for Slack responses
    global.fetch = vi.fn().mockResolvedValue(
      new Response('OK', { status: 200 })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /start', () => {
    it('should start a new task and dispatch sub-tasks', async () => {
      const request = new Request('http://localhost/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Analyze sales data and provide insights',
          responseUrl: 'https://hooks.slack.com/response',
          tenantId: 'tenant-123',
          conversationId: 'conv-456'
        })
      });

      const response = await orchestrator.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('status', 'started');
      
      // Verify task state was stored
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'task',
        expect.objectContaining({
          originalPrompt: 'Analyze sales data and provide insights',
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          status: 'processing',
          finalResponseUrl: 'https://hooks.slack.com/response'
        })
      );
      
      // Verify sub-tasks were dispatched to queue
      expect(mockEnv.TASK_QUEUE.send).toHaveBeenCalledTimes(2);
      expect(mockEnv.TASK_QUEUE.send).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'web_search',
          parameters: { query: 'test' }
        })
      );
    });

    it('should handle task decomposition failures', async () => {
      // Create a new orchestrator with mocked decomposer that throws
      const { TaskDecomposer } = await import('../../lib/taskDecomposer');
      vi.mocked(TaskDecomposer).mockImplementationOnce(() => ({
        decompose: vi.fn().mockRejectedValue(new Error('Failed to decompose task'))
      } as any));
      
      // Create new instance with the mocked decomposer
      orchestrator = new ParentOrchestratorDO(mockState as any, mockEnv as any);

      const request = new Request('http://localhost/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Invalid prompt',
          responseUrl: 'https://hooks.slack.com/response',
          tenantId: 'tenant-123',
          conversationId: 'conv-456'
        })
      });

      const response = await orchestrator.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.error).toContain('Failed to decompose task');
    });

    it('should validate required fields', async () => {
      const request = new Request('http://localhost/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Test prompt'
          // Missing required fields
        })
      });

      const response = await orchestrator.fetch(request);
      
      expect(response.status).toBe(500);
    });
  });  describe('POST /report', () => {
    it('should update sub-task result and check completion', async () => {
      // Set up existing task state
      const taskState: TaskState = {
        id: 'task-123',
        originalPrompt: 'Test prompt',
        tenantId: 'tenant-123',
        conversationId: 'conv-456',
        subTasks: {
          'sub-1': { 
            id: 'sub-1', 
            parentTaskId: 'task-123',
            toolName: 'web_search',
            parameters: { query: 'test' },
            status: 'processing'
          },
          'sub-2': { 
            id: 'sub-2', 
            parentTaskId: 'task-123',
            toolName: 'analyze_data',
            parameters: { data: 'test' },
            status: 'processing'
          }
        },
        status: 'processing',
        finalResponseUrl: 'https://hooks.slack.com/response',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      mockState.storage.get = vi.fn(async () => taskState);

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subTaskId: 'sub-1',
          result: { data: 'search results' }
        })
      });

      const response = await orchestrator.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ success: true });
      
      // Verify sub-task was updated
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'task',
        expect.objectContaining({
          subTasks: expect.objectContaining({
            'sub-1': expect.objectContaining({
              status: 'completed',
              result: { data: 'search results' }
            })
          })
        })
      );
    });

    it('should finalize task when all sub-tasks complete', async () => {
      // Set up task with one remaining sub-task
      const taskState: TaskState = {
        id: 'task-123',
        originalPrompt: 'Test prompt',
        tenantId: 'tenant-123',
        conversationId: 'conv-456',
        subTasks: {
          'sub-1': { 
            id: 'sub-1', 
            parentTaskId: 'task-123',
            toolName: 'web_search',
            parameters: { query: 'test' },
            status: 'completed',
            result: { data: 'search results' }
          },
          'sub-2': { 
            id: 'sub-2', 
            parentTaskId: 'task-123',
            toolName: 'analyze_data',
            parameters: { data: 'test' },
            status: 'processing'
          }
        },
        status: 'processing',
        finalResponseUrl: 'https://hooks.slack.com/response',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      mockState.storage.get = vi.fn(async () => taskState);

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subTaskId: 'sub-2',
          result: { data: 'analysis results' }
        })
      });

      const response = await orchestrator.fetch(request);
      expect(response.status).toBe(200);

      // Wait a tick for async finalization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify Slack response was sent
      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/response',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Synthesized result'),
          headers: { 'Content-Type': 'application/json' }
        })
      );
      
      // Verify alarm was set for cleanup
      expect(mockState.storage.setAlarm).toHaveBeenCalled();
    });

    it('should handle sub-task errors', async () => {
      const taskState: TaskState = {
        id: 'task-123',
        originalPrompt: 'Test prompt',
        tenantId: 'tenant-123',
        conversationId: 'conv-456',
        subTasks: {
          'sub-1': { 
            id: 'sub-1', 
            parentTaskId: 'task-123',
            toolName: 'web_search',
            parameters: { query: 'test' },
            status: 'processing'
          }
        },
        status: 'processing',
        finalResponseUrl: 'https://hooks.slack.com/response',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      mockState.storage.get = vi.fn(async () => taskState);

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subTaskId: 'sub-1',
          error: 'Tool execution failed'
        })
      });

      const response = await orchestrator.fetch(request);

      expect(response.status).toBe(200);
      
      // Verify sub-task was marked as failed
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'task',
        expect.objectContaining({
          subTasks: expect.objectContaining({
            'sub-1': expect.objectContaining({
              status: 'failed',
              error: 'Tool execution failed'
            })
          })
        })
      );
    });

    it('should return 404 for non-existent task', async () => {
      mockState.storage.get = vi.fn(async () => null);

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subTaskId: 'sub-1',
          result: { data: 'results' }
        })
      });

      const response = await orchestrator.fetch(request);

      expect(response.status).toBe(404);
    });
  });  describe('GET /status', () => {
    it('should return current task status', async () => {
      const taskState: TaskState = {
        id: 'task-123',
        originalPrompt: 'Test prompt',
        tenantId: 'tenant-123',
        conversationId: 'conv-456',
        subTasks: {
          'sub-1': { 
            id: 'sub-1', 
            parentTaskId: 'task-123',
            toolName: 'web_search',
            parameters: { query: 'test' },
            status: 'completed',
            result: { data: 'results' }
          },
          'sub-2': { 
            id: 'sub-2', 
            parentTaskId: 'task-123',
            toolName: 'analyze_data',
            parameters: { data: 'test' },
            status: 'processing'
          },
          'sub-3': { 
            id: 'sub-3', 
            parentTaskId: 'task-123',
            toolName: 'summarize',
            parameters: {},
            status: 'failed',
            error: 'Service unavailable'
          }
        },
        status: 'processing',
        finalResponseUrl: 'https://hooks.slack.com/response',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      mockState.storage.get = vi.fn(async () => taskState);

      const request = new Request('http://localhost/status');
      const response = await orchestrator.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({
        taskId: 'task-123',
        status: 'processing',
        subTasksTotal: 3,
        subTasksCompleted: 1,
        subTasksFailed: 1
      });
    });

    it('should return 404 when no active task', async () => {
      mockState.storage.get = vi.fn(async () => null);

      const request = new Request('http://localhost/status');
      const response = await orchestrator.fetch(request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('No active task');
    });
  });

  describe('alarm', () => {
    it('should clean up old task data', async () => {
      await orchestrator.alarm();

      expect(mockState.storage.deleteAll).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const request = new Request('http://localhost/unknown');
      const response = await orchestrator.fetch(request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not found');
    });

    it('should handle Slack webhook failures gracefully', async () => {
      // Set up completed task
      const taskState: TaskState = {
        id: 'task-123',
        originalPrompt: 'Test prompt',
        tenantId: 'tenant-123',
        conversationId: 'conv-456',
        subTasks: {
          'sub-1': { 
            id: 'sub-1', 
            parentTaskId: 'task-123',
            toolName: 'web_search',
            parameters: { query: 'test' },
            status: 'completed',
            result: { data: 'results' }
          }
        },
        status: 'processing',
        finalResponseUrl: 'https://hooks.slack.com/response',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      mockState.storage.get = vi.fn(async () => taskState);

      // Mock fetch to fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const request = new Request('http://localhost/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subTaskId: 'sub-1',
          result: { data: 'final results' }
        })
      });

      await orchestrator.fetch(request);

      // Task should be marked as failed
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'task',
        expect.objectContaining({
          status: 'failed'
        })
      );
    });
  });
});