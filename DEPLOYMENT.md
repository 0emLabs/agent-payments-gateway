# Agent Payments Gateway - Deployment Guide

## Prerequisites

1. Cloudflare account with Workers enabled
2. Wrangler CLI installed (`npm install -g wrangler`)
3. Bun or npm installed

## Step 1: Create KV Namespaces

Run these commands to create the required KV namespaces:

```bash
wrangler kv:namespace create "AUTH_STORE"
wrangler kv:namespace create "PAYMENT_SESSIONS"
wrangler kv:namespace create "ESCROW_STORE"
wrangler kv:namespace create "RATE_LIMIT_STORE"
```

Save the IDs returned and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "AUTH_STORE"
id = "your-auth-store-id"

[[kv_namespaces]]
binding = "PAYMENT_SESSIONS"
id = "your-payment-sessions-id"

[[kv_namespaces]]
binding = "ESCROW_STORE"
id = "your-escrow-store-id"

[[kv_namespaces]]
binding = "RATE_LIMIT_STORE"
id = "your-rate-limit-store-id"
```

## Step 2: Set Secrets

```bash
# Core secrets
wrangler secret put MCP_AUTH_SECRET
wrangler secret put ENCRYPTION_KEY

# Payment provider secrets
wrangler secret put COINBASE_API_KEY
wrangler secret put COINBASE_API_SECRET
wrangler secret put ALCHEMY_API_KEY
wrangler secret put STRIPE_SECRET_KEY

# OAuth secrets (if using developer portal)
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GOOGLE_CLIENT_SECRET
```

## Step 3: Deploy

```bash
cd apps/api
bun install
bun run build
bun run deploy
```

## Step 4: Verify Deployment

Test the health endpoint:

```bash
curl https://payments-api.0emlabs.com/_health
```

Test MCP tools listing:

```bash
curl -X POST https://payments-api.0emlabs.com/mcp \
  -H "Authorization: Bearer YOUR_MCP_AUTH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Step 5: Configure Domain (Optional)

If using a custom domain:

1. Go to Cloudflare Dashboard > Workers & Pages
2. Select your worker
3. Go to Settings > Triggers
4. Add custom domain

## Environment-Specific Deployments

### Development
```bash
wrangler deploy --env dev
```

### Staging
```bash
wrangler deploy --env staging
```

### Production
```bash
wrangler deploy --env production
```

## Monitoring

View logs:
```bash
wrangler tail
```

View metrics in Cloudflare Dashboard:
- Workers & Pages > your-worker > Analytics

## Troubleshooting

### Common Issues

1. **KV namespace not found**
   - Ensure IDs in wrangler.toml match created namespaces
   - Check binding names match code

2. **Authentication failures**
   - Verify MCP_AUTH_SECRET is set correctly
   - Check Authorization header format

3. **CORS errors**
   - Update FRONTEND_URL in wrangler.toml
   - Check allowed origins in middleware

4. **Durable Object errors**
   - Ensure migrations are defined in wrangler.toml
   - Check class names match exports