# Test MCP Server with X402 Payment Integration

A simple Model Context Protocol (MCP) server that demonstrates integration with the X402 payment protocol. This server provides both free and premium endpoints, with the premium endpoints protected by X402 payment requirements.

## Features

- **MCP Protocol Support**: Implements the Model Context Protocol for tools and resources
- **X402 Payment Integration**: Premium endpoints require 0.001 USDC payment on Base Sepolia
- **Free Endpoints**: Basic MCP functionality available without payment
- **Premium Endpoints**: Advanced features protected by X402 middleware
- **Test Data Generation**: Placeholder functionality for demonstration

## Architecture

This server uses the same X402 middleware as the `x402-worker` project, ensuring consistent payment handling across services.

### Payment Configuration

- **Network**: Base Sepolia (testnet)
- **Token**: USDC
- **Amount**: 0.001 USDC (1000 atomic units)
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (default)
- **Payment Destination**: `0x73e741aEC0a1a3134a444d865b591d7363c5Be71` (default)
- **Facilitator**: `https://x402.org/facilitator` (default)

## Installation

1. Install dependencies:
```bash
bun install
```

2. Development:
```bash
bun run dev
```

3. Build and deploy:
```bash
bun run deploy
```

## Endpoints

### Free Endpoints

- `GET /` - Server information and API documentation (returns service details, payment config, and available endpoints)
- `GET /_health` - Health check (returns server status and capabilities)
- `POST /mcp/tools/list` - List available MCP tools (returns all free tools with their schemas)
- `POST /mcp/tools/call` - Call free MCP tools (execute basic tools like test_tool, calculate, generate_data)
- `POST /mcp/resources/list` - List available MCP resources (returns free resources like demo data)
- `POST /mcp/resources/get` - Get free MCP resources (retrieve demo data and server info)

### Premium Endpoints (X402 Protected)

- `POST /paid/mcp/tools/call` - Call premium MCP tools (requires 0.001 USDC payment) - Execute advanced tools like premium_analysis and advanced_calculation with enhanced features
- `POST /paid/mcp/resources/get` - Get premium MCP resources (requires 0.001 USDC payment) - Access exclusive analytics data and advanced metrics

## Available Tools

### Free Tools

1. **test_tool** - Echo back a test message with optional delay
2. **calculate** - Perform basic mathematical operations (add, subtract, multiply, divide)
3. **generate_data** - Generate test data for users, products, or orders

### Premium Tools (Paid)

1. **premium_analysis** - Advanced market analysis with insights
2. **advanced_calculation** - Statistical analysis with power operations

## Available Resources

### Free Resources

- `test://demo-data` - Sample demonstration data
- `test://server-info` - Server information and capabilities

### Premium Resources (Paid)

- `premium://advanced-data` - Advanced metrics and exclusive data
- `premium://analytics` - Business analytics and trends

## MCP Usage Example

### List Tools
```bash
curl -X POST http://localhost:8787/mcp/tools/list \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### Call a Tool
```bash
curl -X POST http://localhost:8787/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "test_tool",
      "arguments": {
        "message": "Hello World!",
        "delay": 1000
      }
    },
    "id": 2
  }'
```

### Access Premium Content (with X402 Payment)

First, attempt to access premium content to get payment requirements:

```bash
curl -X POST http://localhost:8787/paid/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "premium_analysis",
      "arguments": {}
    },
    "id": 3
  }'
```

This will return a 402 Payment Required response with payment details. Then create a payment authorization and retry with the `X-Payment` header.

## X402 Payment Flow

1. **Request Premium Content**: Make a request to any `/paid/*` endpoint
2. **Receive 402 Response**: Server responds with payment requirements
3. **Create Payment**: Use ERC-3009 `transferWithAuthorization` to create a signed payment
4. **Retry with Payment**: Include the signed payment in the `X-Payment` header
5. **Access Granted**: Server verifies payment and provides access

## Development

This server is built with:

- **Hono** - Fast web framework for Cloudflare Workers
- **X402-Hono** - Official X402 payment middleware
- **Zod** - Schema validation
- **TypeScript** - Type safety

## Environment Variables

Set these in your `wrangler.toml`:

- `USDC_CONTRACT_ADDRESS` - USDC contract address on Base Sepolia
- `PAYMENT_DESTINATION` - Your wallet address for receiving payments
- `FACILITATOR_URL` - X402 facilitator service URL

## Testing

The server includes placeholder functionality that doesn't require external services, making it ideal for testing X402 payment flows without complex dependencies.
