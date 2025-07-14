export interface TaskState {
  id: string;
  originalPrompt: string;
  tenantId: string;
  conversationId: string;
  subTasks: Record<string, SubTask>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  finalResponseUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubTask {
  id: string;
  parentTaskId: string;
  toolName: string;
  parameters: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface QueueMessage {
  parentAgentId: string;
  subTaskId: string;
  toolName: string;
  parameters: any;
  tenantId: string;
  conversationId: string;
}