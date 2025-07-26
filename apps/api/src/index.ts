import { Hono } from 'hono';
import { z } from 'zod';
import { 
  cors, 
  securityHeaders, 
  requestId, 
  logger, 
  rateLimit, 
  mcpAuth,
  errorHandler,
  type Env 
} from './shared/middleware';

// Import routes
import { mcpRouter } from './routes/mcp';
import { agentsRouter } from './routes/agents';
import { tasksRouter } from './routes/tasks';
import { walletsRouter } from './routes/wallets';
import { toolsRouter } from './routes/tools';
import { tokenCounterRouter } from './routes/tokenCounter';
import { escrowRouter } from './routes/escrow';
import { authRouter } from './routes/auth';

// Export Durable Objects
export { TransactionOrchestratorDO } from './durable-objects/TransactionOrchestratorDO';
export { AgentStateDO } from './durable-objects/AgentStateDO';

const app = new Hono<{ Bindings: Env }>();

// Apply global middleware
app.use('*', cors());
app.use('*', securityHeaders());
app.use('*', requestId());
app.use('*', logger());
app.use('*', errorHandler());

// Health check endpoint
app.get('/_health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'agent-payments-api',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT
  });
});

// API version endpoint
app.get('/api/version', (c) => {
  return c.json({
    version: '1.0.0',
    api: 'agent-payments',
    protocol: 'mcp-compatible',
    features: [
      'agent-identity',
      'wallet-management',
      'task-execution',
      'token-counting',
      'escrow-payments',
      'tool-registry'
    ]
  });
});

// Mount MCP protocol endpoints
app.route('/', mcpRouter);
app.route('/mcp', mcpRouter);

// Mount REST API endpoints
app.route('/api/auth', authRouter);
app.route('/api/agents', agentsRouter);
app.route('/api/tasks', tasksRouter);
app.route('/api/wallets', walletsRouter);
app.route('/api/tools', toolsRouter);
app.route('/api/tokens', tokenCounterRouter);
app.route('/api/escrow', escrowRouter);

// 404 handler
app.all('*', (c) => {
  return c.json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  }, 404);
});

export default app;