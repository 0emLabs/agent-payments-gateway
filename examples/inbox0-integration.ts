/**
 * Inbox0 Integration Example
 * 
 * This demonstrates how to integrate the Agent Payments Gateway
 * with an email automation service like Inbox0
 */

import { 
  PaymentAPIService, 
  TokenCountingService,
  type Agent,
  type Task,
  type Tool
} from '../packages/sdk-typescript/src';

// Configuration
const config = {
  apiUrl: process.env.PAYMENT_GATEWAY_URL || 'http://localhost:8787',
  apiKey: process.env.MCP_AUTH_SECRET || 'test-secret-key',
  inbox0ApiUrl: process.env.INBOX0_API_URL || 'https://api.inbox0.com'
};

/**
 * Initialize the Inbox0 agent and register its capabilities
 */
export async function setupInbox0Agent(): Promise<Agent> {
  const paymentAPI = new PaymentAPIService();
  
  // Create the Inbox0 agent
  const agent = await paymentAPI.createAgent({
    name: "Inbox0 Email Assistant",
    description: "AI-powered email management and automation",
    metadata: {
      service: "inbox0",
      version: "1.0.0",
      capabilities: [
        "email-categorization",
        "smart-replies",
        "thread-summarization",
        "attachment-analysis",
        "calendar-extraction"
      ]
    },
    wallet: {
      type: "smart-wallet", // Use smart wallet for gasless transactions
      chain: "base"
    }
  });

  console.log(`✅ Inbox0 Agent created: ${agent.id}`);
  console.log(`   Wallet: ${agent.wallet.address}`);
  
  // Register Inbox0's tools
  await registerInbox0Tools(agent.id);
  
  return agent;
}

/**
 * Register all Inbox0 tools in the marketplace
 */
async function registerInbox0Tools(agentId: string): Promise<Tool[]> {
  const paymentAPI = new PaymentAPIService();
  
  const tools = [
    {
      name: "inbox0.categorize",
      description: "Categorize emails using AI to organize inbox",
      version: "1.0.0",
      author: {
        name: "Inbox0",
        email: "dev@inbox0.com",
        agent_id: agentId
      },
      inputSchema: {
        type: "object",
        properties: {
          email_content: { 
            type: "string",
            description: "Full email content including headers"
          },
          available_categories: {
            type: "array",
            items: { type: "string" },
            description: "List of available categories"
          },
          user_rules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                condition: { type: "string" },
                category: { type: "string" }
              }
            },
            description: "User-defined categorization rules"
          }
        },
        required: ["email_content"]
      },
      outputSchema: {
        type: "object",
        properties: {
          category: { type: "string" },
          confidence: { type: "number" },
          reasoning: { type: "string" }
        }
      },
      pricing: {
        model: "per-call" as const,
        amount: 0.005, // $0.005 per email
        currency: "USDC"
      },
      tags: ["email", "categorization", "organization"],
      categories: ["automation"],
      endpoint: {
        url: `${config.inbox0ApiUrl}/tools/categorize`,
        method: "POST" as const,
        auth_type: "bearer" as const
      }
    },
    {
      name: "inbox0.generate_reply",
      description: "Generate contextual email replies using AI",
      version: "1.0.0",
      author: {
        name: "Inbox0",
        email: "dev@inbox0.com",
        agent_id: agentId
      },
      inputSchema: {
        type: "object",
        properties: {
          email_thread: {
            type: "array",
            items: {
              type: "object",
              properties: {
                from: { type: "string" },
                to: { type: "string" },
                subject: { type: "string" },
                body: { type: "string" },
                timestamp: { type: "string" }
              }
            }
          },
          reply_style: {
            type: "string",
            enum: ["professional", "casual", "brief", "detailed"],
            default: "professional"
          },
          key_points: {
            type: "array",
            items: { type: "string" },
            description: "Key points to include in reply"
          },
          tone: {
            type: "string",
            enum: ["positive", "neutral", "apologetic", "assertive"],
            default: "neutral"
          }
        },
        required: ["email_thread"]
      },
      pricing: {
        model: "per-token" as const,
        amount: 0.00002, // $0.02 per 1k tokens
        currency: "USDC",
        token_multiplier: 1000
      },
      tags: ["email", "generation", "ai-writing"],
      categories: ["automation", "ai"],
      endpoint: {
        url: `${config.inbox0ApiUrl}/tools/generate-reply`,
        method: "POST" as const,
        auth_type: "bearer" as const
      }
    },
    {
      name: "inbox0.summarize_thread",
      description: "Create concise summaries of long email threads",
      version: "1.0.0",
      author: {
        name: "Inbox0",
        email: "dev@inbox0.com",
        agent_id: agentId
      },
      inputSchema: {
        type: "object",
        properties: {
          thread_id: { type: "string" },
          max_length: {
            type: "number",
            default: 200,
            description: "Maximum summary length in words"
          },
          include_action_items: {
            type: "boolean",
            default: true
          },
          include_participants: {
            type: "boolean",
            default: true
          }
        },
        required: ["thread_id"]
      },
      pricing: {
        model: "per-call" as const,
        amount: 0.01,
        currency: "USDC"
      },
      tags: ["email", "summarization", "productivity"],
      categories: ["automation", "ai"],
      endpoint: {
        url: `${config.inbox0ApiUrl}/tools/summarize-thread`,
        method: "POST" as const,
        auth_type: "bearer" as const
      }
    }
  ];

  const registeredTools: Tool[] = [];
  
  for (const tool of tools) {
    try {
      const registered = await paymentAPI.registerTool(tool);
      console.log(`✅ Registered tool: ${registered.name}`);
      registeredTools.push(registered);
    } catch (error) {
      console.error(`❌ Failed to register ${tool.name}:`, error);
    }
  }
  
  return registeredTools;
}

/**
 * Example: Process an email with token estimation and payment
 */
export async function processEmailWithPayment(
  userAgentId: string,
  inbox0AgentId: string,
  emailContent: string
): Promise<void> {
  const paymentAPI = new PaymentAPIService();
  const tokenService = new TokenCountingService();
  
  console.log("\n📧 Processing email with payment flow...");
  
  // Step 1: Estimate tokens for the operation
  const estimation = await tokenService.estimateTokens(
    emailContent,
    "gpt-4", // Model used by Inbox0
    true,    // Include escrow
    15       // 15% buffer
  );
  
  console.log(`   Token estimate: ${estimation.total_tokens} tokens`);
  console.log(`   Base cost: $${estimation.cost.toFixed(4)}`);
  console.log(`   With escrow: $${estimation.escrow?.total_cost.toFixed(4) || estimation.cost.toFixed(4)}`);
  
  // Step 2: Execute the categorization task
  const task = await paymentAPI.executeTask({
    from_agent_id: userAgentId,
    to_agent_id: inbox0AgentId,
    tool_name: "inbox0.categorize",
    parameters: {
      email_content: emailContent,
      available_categories: ["Work", "Personal", "Newsletters", "Promotions", "Spam"]
    },
    payment: {
      amount: 0.005, // Tool cost
      currency: "USDC",
      chain: "base"
    },
    options: {
      estimate_tokens: true,
      escrow_buffer_percent: 15,
      timeout_ms: 30000
    }
  });
  
  console.log(`   Task created: ${task.id}`);
  console.log(`   Status: ${task.status}`);
  
  // Step 3: Monitor task execution
  let currentTask = task;
  while (currentTask.status === "pending" || currentTask.status === "processing") {
    await new Promise(resolve => setTimeout(resolve, 2000));
    currentTask = await paymentAPI.getTask(task.id);
    console.log(`   Status update: ${currentTask.status}`);
  }
  
  // Step 4: Get results
  if (currentTask.status === "completed") {
    const result = await paymentAPI.getTaskResult(task.id);
    console.log("\n✅ Email categorized successfully!");
    console.log(`   Category: ${result.category}`);
    console.log(`   Confidence: ${result.confidence}%`);
    console.log(`   Reasoning: ${result.reasoning}`);
    
    // Track token usage
    await tokenService.trackUsage(
      task.id,
      "gpt-4",
      estimation.prompt_tokens,
      estimation.completion_tokens || 0,
      {
        tool: "inbox0.categorize",
        email_length: emailContent.length
      }
    );
  } else {
    console.error(`❌ Task failed with status: ${currentTask.status}`);
  }
}

/**
 * Example: Batch process multiple emails
 */
export async function batchProcessEmails(
  userAgentId: string,
  inbox0AgentId: string,
  emails: Array<{ id: string; content: string }>
): Promise<void> {
  const paymentAPI = new PaymentAPIService();
  const tokenService = new TokenCountingService();
  
  console.log(`\n📬 Batch processing ${emails.length} emails...`);
  
  // Step 1: Batch estimate tokens
  const estimations = await tokenService.batchEstimateTokens(
    emails.map(email => ({
      id: email.id,
      text: email.content,
      model: "gpt-4"
    })),
    true,
    15
  );
  
  console.log(`   Total tokens: ${estimations.summary.total_tokens}`);
  console.log(`   Total cost: $${estimations.summary.total_cost.toFixed(4)}`);
  
  // Step 2: Create escrow for batch operation
  const totalCost = emails.length * 0.005; // $0.005 per email
  const escrow = await paymentAPI.createEscrow({
    from_agent_id: userAgentId,
    to_agent_id: inbox0AgentId,
    amount: totalCost,
    currency: "USDC",
    chain: "base",
    conditions: {
      release_on_completion: true,
      timeout_seconds: 300, // 5 minutes for batch
      auto_release: false
    }
  });
  
  console.log(`   Escrow created: ${escrow.id}`);
  console.log(`   Amount locked: $${escrow.amount}`);
  
  // Step 3: Process emails in parallel
  const tasks = await Promise.all(
    emails.map(email => 
      paymentAPI.executeTask({
        from_agent_id: userAgentId,
        to_agent_id: inbox0AgentId,
        tool_name: "inbox0.categorize",
        parameters: {
          email_content: email.content,
          available_categories: ["Work", "Personal", "Newsletters", "Promotions", "Spam"]
        },
        payment: {
          amount: 0.005,
          currency: "USDC",
          chain: "base"
        }
      })
    )
  );
  
  console.log(`   Created ${tasks.length} tasks`);
  
  // Step 4: Wait for all tasks to complete
  const results = await Promise.all(
    tasks.map(async task => {
      let currentTask = task;
      while (currentTask.status === "pending" || currentTask.status === "processing") {
        await new Promise(resolve => setTimeout(resolve, 2000));
        currentTask = await paymentAPI.getTask(task.id);
      }
      return currentTask;
    })
  );
  
  // Step 5: Release escrow based on results
  const successCount = results.filter(r => r.status === "completed").length;
  console.log(`\n   Completed: ${successCount}/${emails.length} emails`);
  
  if (successCount === emails.length) {
    await paymentAPI.releaseEscrow({
      escrow_id: escrow.id,
      release_to: "provider",
      reason: "All emails processed successfully"
    });
    console.log("✅ Escrow released to Inbox0");
  } else {
    // Partial refund logic could go here
    console.log("⚠️  Some emails failed to process");
  }
}

/**
 * Example: Generate usage report
 */
export async function generateUsageReport(): Promise<void> {
  const tokenService = new TokenCountingService();
  
  const stats = tokenService.getUsageStats(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    new Date()
  );
  
  console.log("\n📊 Inbox0 Usage Report (Last 7 Days)");
  console.log("=====================================");
  console.log(`Total Tokens: ${stats.total_tokens.toLocaleString()}`);
  console.log(`Total Cost: $${stats.total_cost.toFixed(2)}`);
  
  console.log("\nBy Model:");
  Object.entries(stats.by_model).forEach(([model, data]) => {
    console.log(`  ${model}: ${data.tokens.toLocaleString()} tokens ($${data.cost.toFixed(2)})`);
  });
  
  console.log("\nDaily Breakdown:");
  Object.entries(stats.by_day).forEach(([day, data]) => {
    console.log(`  ${day}: ${data.tokens.toLocaleString()} tokens ($${data.cost.toFixed(2)})`);
  });
  
  // Export to CSV
  const csv = tokenService.exportUsageAsCSV();
  console.log("\n📁 Usage data exported to CSV");
}

// Main test function
export async function runInbox0IntegrationTest(): Promise<void> {
  try {
    console.log("🚀 Starting Inbox0 Integration Test\n");
    
    // Setup
    const inbox0Agent = await setupInbox0Agent();
    
    // Create a test user agent
    const paymentAPI = new PaymentAPIService();
    const userAgent = await paymentAPI.createAgent({
      name: "Test User",
      description: "Test user for Inbox0 integration"
    });
    
    // Test single email processing
    await processEmailWithPayment(
      userAgent.id,
      inbox0Agent.id,
      "From: boss@company.com\nSubject: Q3 Report Review\n\nPlease review the attached Q3 report and provide feedback by EOD."
    );
    
    // Test batch processing
    await batchProcessEmails(
      userAgent.id,
      inbox0Agent.id,
      [
        { id: "email-1", content: "Newsletter content..." },
        { id: "email-2", content: "Meeting invitation..." },
        { id: "email-3", content: "Promotional offer..." }
      ]
    );
    
    // Generate report
    await generateUsageReport();
    
    console.log("\n✅ Integration test completed successfully!");
    
  } catch (error) {
    console.error("\n❌ Integration test failed:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runInbox0IntegrationTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}