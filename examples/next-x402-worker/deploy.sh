#!/bin/bash

# X402 Worker Deployment Script

echo "🚀 Deploying X402 Payment Worker..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "🔐 Please login to Cloudflare..."
    wrangler login
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create KV namespaces if they don't exist
echo "🗄️ Setting up KV namespaces..."
echo "Please run these commands manually and update wrangler.toml:"
echo "wrangler kv:namespace create \"X402_KV\""
echo "wrangler kv:namespace create \"X402_KV\" --preview"

# Deploy to staging first
echo "🧪 Deploying to staging..."
wrangler deploy --env staging

echo "✅ Staging deployment complete!"
echo ""
echo "To deploy to production:"
echo "wrangler deploy --env production"
echo ""
echo "To test your deployment:"
echo "curl https://x402-worker.your-subdomain.workers.dev/"
