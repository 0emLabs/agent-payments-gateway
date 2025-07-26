#!/bin/bash

# Local Testing Script for Agent Payments Gateway
# This script helps test the API locally before deployment

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="http://localhost:8787"
SECRET="test-secret-key"

echo -e "${GREEN}🧪 Agent Payments Gateway - Local Testing${NC}"
echo -e "API URL: $API_URL"
echo ""

# Function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ "$method" = "GET" ]; then
        curl -s -X GET "$API_URL$endpoint" \
            -H "Authorization: Bearer $SECRET" \
            -H "Content-Type: application/json"
    else
        curl -s -X "$method" "$API_URL$endpoint" \
            -H "Authorization: Bearer $SECRET" \
            -H "Content-Type: application/json" \
            -d "$data"
    fi
}

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
api_call GET "/_health" | jq .
echo ""

# Test 2: MCP Tools List
echo -e "${YELLOW}Test 2: List MCP Tools${NC}"
api_call POST "/mcp" '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
}' | jq .
echo ""

# Test 3: Create Agent
echo -e "${YELLOW}Test 3: Create Test Agent${NC}"
AGENT_RESPONSE=$(api_call POST "/api/agents" '{
    "name": "Test Agent",
    "description": "Local testing agent"
}')
echo "$AGENT_RESPONSE" | jq .
AGENT_ID=$(echo "$AGENT_RESPONSE" | jq -r '.agent.id')
echo -e "${BLUE}Agent ID: $AGENT_ID${NC}"
echo ""

# Test 4: Get Agent
echo -e "${YELLOW}Test 4: Get Agent Details${NC}"
api_call GET "/api/agents/$AGENT_ID" | jq .
echo ""

# Test 5: Token Estimation
echo -e "${YELLOW}Test 5: Estimate Tokens${NC}"
api_call POST "/api/tokens/estimate" '{
    "text": "This is a test message to estimate token usage",
    "model": "gpt-4",
    "include_escrow": true,
    "escrow_buffer_percent": 15
}' | jq .
echo ""

# Test 6: Get Supported Models
echo -e "${YELLOW}Test 6: Get Supported Models${NC}"
api_call GET "/api/tokens/models" | jq '. | {models: .models[0:3]}'
echo ""

# Test 7: Register Tool
echo -e "${YELLOW}Test 7: Register Test Tool${NC}"
TOOL_RESPONSE=$(api_call POST "/api/tools/register" '{
    "name": "test_tool",
    "description": "A test tool for local testing",
    "author": {
        "name": "Test Author",
        "agent_id": "'$AGENT_ID'"
    },
    "pricing": {
        "model": "per-call",
        "amount": 0.01,
        "currency": "USDC"
    },
    "endpoint": {
        "url": "http://localhost:3000/test",
        "method": "POST"
    },
    "inputSchema": {
        "type": "object",
        "properties": {
            "input": {"type": "string"}
        }
    },
    "tags": ["test", "local"]
}')
echo "$TOOL_RESPONSE" | jq .
TOOL_ID=$(echo "$TOOL_RESPONSE" | jq -r '.tool.id')
echo -e "${BLUE}Tool ID: $TOOL_ID${NC}"
echo ""

# Test 8: Search Tools
echo -e "${YELLOW}Test 8: Search Tools${NC}"
api_call GET "/api/tools?q=test" | jq .
echo ""

# Test 9: Create Second Agent for Task Test
echo -e "${YELLOW}Test 9: Create Second Agent${NC}"
AGENT2_RESPONSE=$(api_call POST "/api/agents" '{
    "name": "Provider Agent",
    "description": "Agent that provides services"
}')
AGENT2_ID=$(echo "$AGENT2_RESPONSE" | jq -r '.agent.id')
echo -e "${BLUE}Provider Agent ID: $AGENT2_ID${NC}"
echo ""

# Test 10: Create Escrow
echo -e "${YELLOW}Test 10: Create Escrow${NC}"
ESCROW_RESPONSE=$(api_call POST "/api/escrow" '{
    "from_agent_id": "'$AGENT_ID'",
    "to_agent_id": "'$AGENT2_ID'",
    "amount": 0.1,
    "currency": "USDC",
    "chain": "base",
    "conditions": {
        "release_on_completion": true,
        "timeout_seconds": 3600
    }
}')
echo "$ESCROW_RESPONSE" | jq .
ESCROW_ID=$(echo "$ESCROW_RESPONSE" | jq -r '.escrow.id')
echo -e "${BLUE}Escrow ID: $ESCROW_ID${NC}"
echo ""

# Summary
echo -e "${GREEN}✅ Basic API tests completed!${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Test task execution with the created agents"
echo "2. Test wallet operations"
echo "3. Test the payment flow end-to-end"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "- View logs: wrangler tail"
echo "- Check KV storage: wrangler kv:key list --namespace-id=YOUR_NAMESPACE_ID"
echo "- Test specific endpoint: curl -X POST $API_URL/endpoint -H 'Authorization: Bearer $SECRET'"