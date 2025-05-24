import { createApp } from './index';
import { Env } from './types/env';

// Import Durable Objects
import { AgentStateDO } from './agents/AgentStateDO';
import { TransactionOrchestratorDO } from './transactions/TransactionOrchestratorDO';
import { ToolRegistryDO } from './durable-objects/ToolRegistryDO';
import { RateLimiterDO } from './durable-objects/RateLimiterDO';

// Export Durable Objects
export { AgentStateDO, TransactionOrchestratorDO, ToolRegistryDO, RateLimiterDO };

// Create and export the worker
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = createApp();
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Handle scheduled tasks like escrow timeouts, session key expiration, etc.
    console.log('Scheduled event triggered:', event.cron);
    
    // Example: Clean up expired escrows
    if (event.cron === '0 */1 * * *') { // Every hour
      // Implement cleanup logic
    }
  },

  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    // Handle queued messages for async processing
    for (const message of batch.messages) {
      try {
        // Process message
        console.log('Processing queued message:', message.id);
        message.ack();
      } catch (error) {
        console.error('Failed to process message:', error);
        message.retry();
      }
    }
  }
};