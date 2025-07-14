# Cloudflare AI Agent System

A production-grade, Cloudflare-native AI agent system with Slack integration, built entirely on Cloudflare's developer platform.

## Architecture Overview

This system implements a hierarchical swarm pattern with:
- **Gateway Worker**: Handles Slack integration and authentication
- **Parent Orchestrator (Durable Object)**: Manages complex tasks and coordinates sub-agents
- **Context Controller (Durable Object)**: Manages conversation transcripts with rolling windows
- **Sub-Agent Workers**: Execute specialized tools via queue consumption
- **Rate Limiter (Durable Object)**: Per-tenant usage control

## Key Features

- **Stateful Context Management**: Hybrid R2 + Durable Object model for transcript storage
- **Asynchronous Task Processing**: Cloudflare Queues for decoupled execution
- **Multi-Tenant Security**: OAuth flow with per-tenant data isolation and encryption
- **Tool System**: Zod-validated tools with caching and context awareness
- **Slack Integration**: Rich Block Kit UI with 3-second response handling

## Project Structure

```
src/
├── index.ts                    # Main gateway worker
├── workers/
│   └── subAgentWorker.ts      # Queue consumer for tool execution
├── durable-objects/
│   ├── ParentOrchestratorDO.ts # Task coordination
│   ├── ContextControllerDO.ts  # Transcript management
│   └── RateLimiterDO.ts       # Usage limiting
├── lib/
│   ├── slackAuth.ts           # Slack request verification
│   ├── slackBlockBuilder.ts   # UI templates
│   ├── toolRegistry.ts        # Tool definitions
│   ├── toolExecutor.ts        # Tool implementations
│   ├── taskDecomposer.ts      # Task breakdown logic
│   ├── resultSynthesizer.ts   # Result aggregation
│   └── cacheManager.ts        # KV caching
├── utils/
│   ├── tokenCounter.ts        # Token estimation
│   └── encryption.ts          # Per-tenant encryption
└── types/
    ├── env.ts                 # Environment bindings
    ├── task.ts                # Task state types
    └── transcript.ts          # Transcript types
```

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Secrets**
   ```bash
   wrangler secret put SLACK_SIGNING_SECRET
   wrangler secret put MCP_AUTH_SECRET
   wrangler secret put JWT_SIGNING_KEY
   wrangler secret put TENANT_ENCRYPTION_KEYS
   ```

3. **Create Resources**
   ```bash
   # Create KV namespaces
   wrangler kv:namespace create "TOOL_CACHE"
   wrangler kv:namespace create "AUTH_STORE"
   wrangler kv:namespace create "STATE_STORE"
   
   # Create R2 bucket
   wrangler r2 bucket create ai-agent-transcripts
   
   # Create D1 database
   wrangler d1 create ai-agent-metadata
   ```

4. **Update wrangler.toml**
   Replace the placeholder IDs with actual resource IDs from creation steps.

5. **Deploy**
   ```bash
   wrangler deploy
   ```

## Development

```bash
# Run locally with Miniflare
npm run dev

# Type checking
npm run typecheck

# Run tests
npm test
```

## Slack App Configuration

1. Create a Slack app at api.slack.com
2. Add slash command pointing to: `https://your-worker.workers.dev/slack/commands`
3. Add interactivity URL: `https://your-worker.workers.dev/slack/interactions`
4. Install app to workspace

## Security Considerations

- All data is encrypted at rest using per-tenant AES-256 keys
- Slack requests are verified using HMAC signatures
- Rate limiting prevents abuse (20 req/min, 1000/day per tenant)
- OAuth tokens stored encrypted in KV

## Performance Optimizations

- Tool outputs cached in KV with TTL
- Structure-aware transcript truncation
- Queue-based async processing
- Durable Object state management

## Future Enhancements

- Vector database integration for RAG
- Multi-provider LLM support
- Advanced prompt caching
- Webhook notifications
- Analytics dashboard