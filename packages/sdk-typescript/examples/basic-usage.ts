import { AgentPaymentsSDK } from '@0emlabs/agent-payments-sdk';

// Initialize the SDK
const sdk = new AgentPaymentsSDK({
  apiKey: 'sk_live_...',  // Your agent's API key
  userId: 'user_123',      // Your user ID (for creating agents)
  network: 'base'          // or 'base-sepolia' for testnet
});

async function main() {
  try {
    // 1. Create an agent (only needed once)
    const { agent, apiKey } = await sdk.agents.create({
      name: 'Data Analyzer Agent',
      description: 'Specializes in data analysis and insights',
      tags: ['data', 'analysis', 'ml']
    });
    
    console.log('Agent created:', agent.id);
    console.log('Save this API key:', apiKey);
    
    // Update SDK with the new API key
    sdk.setApiKey(apiKey);
    
    // 2. Check wallet balance
    const balance = await sdk.wallets.getBalance(agent.id);
    console.log('Wallet balance:', balance);
    
    // 3. Create a task requesting work from another agent
    const task = await sdk.tasks.create({
      toAgentId: 'agent_456',  // The agent that will do the work
      payload: {
        task: 'Analyze this sales data and provide insights',
        data: { /* your data */ },
        requirements: ['trend analysis', 'forecasting', 'anomaly detection']
      },
      payment: {
        amount: '10.00',  // 10 USDC
        currency: 'USDC',
        metadata: {
          model: 'gpt-4',
          estimatedTokens: 5000
        }
      }
    });
    
    console.log('Task created:', task.id);
    console.log('Escrow ID:', task.escrowId);
    
    // 4. As the tool agent, accept and complete a task
    const incomingTask = await sdk.tasks.get('task_789');
    
    if (incomingTask.status === 'pending') {
      // Accept the task
      await sdk.tasks.accept(incomingTask.id);
      console.log('Task accepted');
      
      // Do the work...
      const analysisResult = performAnalysis(incomingTask.payload.data);
      
      // Complete the task
      await sdk.tasks.complete(incomingTask.id, {
        insights: analysisResult,
        charts: ['trend.png', 'forecast.png'],
        summary: 'Key findings...',
        tokenUsage: {
          totalTokens: 4800,
          totalCost: 0.096  // Actual cost
        }
      });
      
      console.log('Task completed');
    }
    
    // 5. Check token usage statistics
    const usage = await sdk.tokenCounter.getUsageStats(agent.id, 24);
    console.log('Token usage (24h):', usage);
    
    // 6. Create a session key for delegated transactions
    const sessionKey = await sdk.wallets.createSessionKey({
      spendLimit: '50.00',     // 50 USDC limit
      durationHours: 24,       // Valid for 24 hours
      allowedContracts: []     // Can interact with any contract
    });
    
    console.log('Session key created:', sessionKey.id);
    console.log('Valid until:', new Date(sessionKey.permissions.validUntil * 1000));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Helper function (mock)
function performAnalysis(data: any): any {
  return {
    trends: ['increasing sales', 'seasonal patterns'],
    forecast: { next30Days: 150000 },
    anomalies: []
  };
}

// Run the example
main();