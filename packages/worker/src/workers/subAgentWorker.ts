import { Env } from '../types/env';
import { QueueMessage } from '../types/task';
import { ToolRegistry } from '../lib/toolRegistry';
import { ToolExecutor } from '../lib/toolExecutor';
import { CacheManager } from '../lib/cacheManager';

export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    const toolRegistry = new ToolRegistry();
    const toolExecutor = new ToolExecutor(env);
    const cacheManager = new CacheManager(env.TOOL_CACHE);
    
    for (const message of batch.messages) {
      try {
        await processMessage(message.body, env, toolRegistry, toolExecutor, cacheManager);
        message.ack();
      } catch (error) {
        console.error(`Failed to process message ${message.body.subTaskId}:`, error);
        message.retry();
      }
    }
  }
};

async function processMessage(
  message: QueueMessage,
  env: Env,
  toolRegistry: ToolRegistry,
  toolExecutor: ToolExecutor,
  cacheManager: CacheManager
): Promise<void> {
  const { parentAgentId, subTaskId, toolName, parameters, tenantId, conversationId } = message;
  
  try {
    // Check cache first
    const cacheKey = cacheManager.generateKey(toolName, parameters);
    const cachedResult = await cacheManager.get(cacheKey);
    
    if (cachedResult) {
      console.log(`Cache hit for ${toolName}`);
      await reportResult(env, parentAgentId, subTaskId, cachedResult);
      return;
    }
    
    // Get tool definition
    const tool = toolRegistry.getTool(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    
    // Get conversation context if needed
    let context = '';
    if (tool.requiresContext) {
      const contextId = env.CONTEXT_CONTROLLER.idFromName(`${tenantId}:${conversationId}`);
      const contextController = env.CONTEXT_CONTROLLER.get(contextId);
      
      const response = await contextController.fetch(
        new Request(`${env.WORKER_URL}/context?tenantId=${tenantId}&conversationId=${conversationId}`)
      );
      
      const data = await response.json() as { context: string };
      context = data.context;
    }
    
    // Execute tool
    const result = await toolExecutor.execute(toolName, parameters, context);
    
    // Cache result if cacheable
    if (tool.cacheable) {
      const ttl = tool.cacheTTL || 300; // Default 5 minutes
      await cacheManager.set(cacheKey, result, ttl);
    }
    
    // Report result back to parent
    await reportResult(env, parentAgentId, subTaskId, result);
    
  } catch (error) {
    // Report error back to parent
    await reportError(env, parentAgentId, subTaskId, error.message);
  }
}async function reportResult(
  env: Env,
  parentAgentId: string,
  subTaskId: string,
  result: any
): Promise<void> {
  const doId = env.PARENT_ORCHESTRATOR.idFromString(parentAgentId);
  const orchestrator = env.PARENT_ORCHESTRATOR.get(doId);
  
  await orchestrator.fetch(new Request(`${env.WORKER_URL}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subTaskId, result })
  }));
}

async function reportError(
  env: Env,
  parentAgentId: string,
  subTaskId: string,
  error: string
): Promise<void> {
  const doId = env.PARENT_ORCHESTRATOR.idFromString(parentAgentId);
  const orchestrator = env.PARENT_ORCHESTRATOR.get(doId);
  
  await orchestrator.fetch(new Request(`${env.WORKER_URL}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subTaskId, error })
  }));
}