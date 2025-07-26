#!/bin/bash

# Agent Payments Gateway Deployment Script
# Usage: ./scripts/deploy.sh [environment]
# Environments: dev, staging, production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default to development environment
ENV=${1:-dev}

echo -e "${GREEN}🚀 Deploying Agent Payments Gateway - Environment: $ENV${NC}"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler CLI not found. Please install it first:${NC}"
    echo "npm install -g wrangler"
    exit 1
fi

# Change to API directory
cd apps/api

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
if command -v bun &> /dev/null; then
    bun install
else
    npm install
fi

# Build the project
echo -e "${YELLOW}🔨 Building project...${NC}"
if command -v bun &> /dev/null; then
    bun run build
else
    npm run build
fi

# Create KV namespaces if they don't exist
echo -e "${YELLOW}🗄️  Setting up KV namespaces...${NC}"

create_namespace() {
    local name=$1
    local binding=$2
    
    # Check if namespace exists
    if wrangler kv:namespace list | grep -q "\"title\": \"$name\""; then
        echo "  ✓ Namespace $name already exists"
    else
        echo "  Creating namespace: $name"
        wrangler kv:namespace create "$binding" --preview
    fi
}

# Create namespaces
create_namespace "agent-payments-auth-$ENV" "AUTH_STORE"
create_namespace "agent-payments-sessions-$ENV" "PAYMENT_SESSIONS"
create_namespace "agent-payments-escrow-$ENV" "ESCROW_STORE"
create_namespace "agent-payments-ratelimit-$ENV" "RATE_LIMIT_STORE"

# Deploy based on environment
echo -e "${YELLOW}🚀 Deploying to Cloudflare Workers...${NC}"

if [ "$ENV" = "production" ]; then
    echo -e "${RED}⚠️  Production deployment - are you sure? (y/N)${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled"
        exit 0
    fi
    wrangler deploy --env production
elif [ "$ENV" = "staging" ]; then
    wrangler deploy --env staging
else
    wrangler deploy --env dev
fi

# Verify deployment
echo -e "${YELLOW}✅ Verifying deployment...${NC}"

if [ "$ENV" = "production" ]; then
    WORKER_URL="https://payments-api.0emlabs.com"
elif [ "$ENV" = "staging" ]; then
    WORKER_URL="https://payments-api-staging.0emlabs.com"
else
    WORKER_URL="https://payments-api-dev.0emlabs.com"
fi

# Test health endpoint
if curl -s "$WORKER_URL/_health" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Deployment successful! API is healthy.${NC}"
    echo -e "API URL: $WORKER_URL"
else
    echo -e "${RED}❌ Deployment verification failed!${NC}"
    exit 1
fi

# Show post-deployment steps
echo -e "\n${YELLOW}📋 Post-deployment steps:${NC}"
echo "1. Set secrets (if not already set):"
echo "   wrangler secret put MCP_AUTH_SECRET"
echo "   wrangler secret put ENCRYPTION_KEY"
echo "   wrangler secret put COINBASE_API_KEY"
echo "   wrangler secret put ALCHEMY_API_KEY"
echo ""
echo "2. Update frontend environment variables:"
echo "   VITE_PAYMENT_GATEWAY_URL=$WORKER_URL"
echo ""
echo "3. Test the API:"
echo "   curl -X POST $WORKER_URL/mcp \\"
echo "     -H 'Authorization: Bearer YOUR_SECRET' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"id\":1}'"

echo -e "\n${GREEN}🎉 Deployment complete!${NC}"