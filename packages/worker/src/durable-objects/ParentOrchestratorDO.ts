import { Env } from '../types/env';
import { TaskState, SubTask, QueueMessage } from '../types/task';
import { TaskDecomposer } from '../lib/taskDecomposer';
import { ResultSynthesizer } from '../lib/resultSynthesizer';

export class ParentOrchestratorDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private taskDecomposer: TaskDecomposer;
  private resultSynthesizer: ResultSynthesizer;
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.taskDecomposer = new TaskDecomposer();
    this.resultSynthesizer = new ResultSynthesizer();
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    
    switch (`${method} ${url.pathname}`) {
      case 'POST /start':
        return this.handleStartTask(request);
      case 'POST /report':
        return this.handleReportResult(request);
      case 'GET /status':
        return this.handleGetStatus(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }  private async handleStartTask(request: Request): Promise<Response> {
    try {
      const { prompt, responseUrl, tenantId, conversationId } = await request.json() as {
        prompt: string;
        responseUrl: string;
        tenantId: string;
        conversationId: string;
      };
      
      const taskId = crypto.randomUUID();
      const taskState: TaskState = {
        id: taskId,
        originalPrompt: prompt,
        tenantId,
        conversationId,
        subTasks: {},
        status: 'pending',
        finalResponseUrl: responseUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Store task state
      await this.state.storage.put('task', taskState);
      
      // Decompose the task into sub-tasks
      const subTasks = await this.taskDecomposer.decompose(prompt);
      
      // Create and dispatch sub-tasks
      for (const subTaskDef of subTasks) {
        const subTask: SubTask = {
          id: crypto.randomUUID(),
          parentTaskId: taskId,
          toolName: subTaskDef.toolName,
          parameters: subTaskDef.parameters,
          status: 'pending'
        };
        
        taskState.subTasks[subTask.id] = subTask;
        
        // Dispatch to queue
        await this.dispatchSubTask(subTask, taskState);
      }
      
      // Update task state
      taskState.status = 'processing';
      taskState.updatedAt = new Date().toISOString();
      await this.state.storage.put('task', taskState);
      
      return new Response(JSON.stringify({ taskId, status: 'started' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }  private async handleReportResult(request: Request): Promise<Response> {
    try {
      const { subTaskId, result, error } = await request.json() as {
        subTaskId: string;
        result?: any;
        error?: string;
      };
      
      const taskState = await this.state.storage.get<TaskState>('task');
      if (!taskState || !taskState.subTasks[subTaskId]) {
        return new Response('Task not found', { status: 404 });
      }
      
      // Update sub-task
      const subTask = taskState.subTasks[subTaskId];
      subTask.status = error ? 'failed' : 'completed';
      subTask.result = result;
      subTask.error = error;
      subTask.completedAt = new Date().toISOString();
      
      // Check if all sub-tasks are complete
      const allComplete = Object.values(taskState.subTasks).every(
        st => st.status === 'completed' || st.status === 'failed'
      );
      
      if (allComplete) {
        await this.finalizeTask(taskState);
      } else {
        // Just update the state
        taskState.updatedAt = new Date().toISOString();
        await this.state.storage.put('task', taskState);
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }  private async handleGetStatus(request: Request): Promise<Response> {
    try {
      const taskState = await this.state.storage.get<TaskState>('task');
      
      if (!taskState) {
        return new Response('No active task', { status: 404 });
      }
      
      return new Response(JSON.stringify({
        taskId: taskState.id,
        status: taskState.status,
        subTasksTotal: Object.keys(taskState.subTasks).length,
        subTasksCompleted: Object.values(taskState.subTasks).filter(
          st => st.status === 'completed'
        ).length,
        subTasksFailed: Object.values(taskState.subTasks).filter(
          st => st.status === 'failed'
        ).length
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }  private async dispatchSubTask(subTask: SubTask, taskState: TaskState): Promise<void> {
    const message: QueueMessage = {
      parentAgentId: this.state.id.toString(),
      subTaskId: subTask.id,
      toolName: subTask.toolName,
      parameters: subTask.parameters,
      tenantId: taskState.tenantId,
      conversationId: taskState.conversationId
    };
    
    await this.env.TASK_QUEUE.send(message);
    
    subTask.status = 'processing';
    subTask.startedAt = new Date().toISOString();
  }
  
  private async finalizeTask(taskState: TaskState): Promise<void> {
    try {
      // Synthesize results
      const finalAnswer = await this.resultSynthesizer.synthesize(
        taskState.originalPrompt,
        taskState.subTasks
      );
      
      // Send response to Slack
      const responsePayload = {
        replace_original: "true",
        text: finalAnswer,
        blocks: this.createResponseBlocks(finalAnswer, taskState)
      };
      
      await fetch(taskState.finalResponseUrl, {
        method: 'POST',
        body: JSON.stringify(responsePayload),
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Update task state
      taskState.status = 'completed';
      taskState.updatedAt = new Date().toISOString();
      await this.state.storage.put('task', taskState);
      
      // Clean up after some time
      await this.state.storage.setAlarm(Date.now() + 3600000); // 1 hour
    } catch (error) {
      console.error('Failed to finalize task:', error);
      taskState.status = 'failed';
      await this.state.storage.put('task', taskState);
    }
  }  private createResponseBlocks(answer: string, taskState: TaskState): any[] {
    const successCount = Object.values(taskState.subTasks).filter(
      st => st.status === 'completed'
    ).length;
    const failedCount = Object.values(taskState.subTasks).filter(
      st => st.status === 'failed'
    ).length;
    
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: answer
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `✅ ${successCount} tools succeeded | ❌ ${failedCount} tools failed | ⏱️ ${this.getElapsedTime(taskState)}`
          }
        ]
      }
    ];
  }
  
  private getElapsedTime(taskState: TaskState): string {
    const start = new Date(taskState.createdAt).getTime();
    const end = new Date(taskState.updatedAt).getTime();
    const elapsed = end - start;
    const seconds = Math.floor(elapsed / 1000);
    return `${seconds}s`;
  }
  
  async alarm(): Promise<void> {
    // Clean up old task data
    await this.state.storage.deleteAll();
  }
}