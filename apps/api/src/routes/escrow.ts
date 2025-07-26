import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type Env } from '../shared/middleware';

const escrowRouter = new Hono<{ Bindings: Env }>();

// Schemas
const CreateEscrowSchema = z.object({
  from_agent_id: z.string(),
  to_agent_id: z.string(),
  amount: z.number().positive(),
  currency: z.enum(['USDC', 'ETH']).default('USDC'),
  chain: z.enum(['base', 'polygon', 'ethereum']).default('base'),
  task_id: z.string().optional(),
  conditions: z.object({
    release_on_completion: z.boolean().default(true),
    timeout_seconds: z.number().default(3600), // 1 hour default
    auto_release: z.boolean().default(false)
  }).optional(),
  metadata: z.record(z.any()).optional()
});

const ReleaseEscrowSchema = z.object({
  escrow_id: z.string(),
  release_to: z.enum(['provider', 'payer']),
  reason: z.string().optional(),
  partial_amount: z.number().positive().optional()
});

const EscrowStatusSchema = z.enum(['pending', 'locked', 'released', 'refunded', 'expired']);

// Create escrow
escrowRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = CreateEscrowSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const escrowData = parseResult.data;
  const escrowId = crypto.randomUUID();
  
  try {
    // Verify both agents exist
    const fromAgent = await c.env.AUTH_STORE.get(`agent:${escrowData.from_agent_id}`);
    const toAgent = await c.env.AUTH_STORE.get(`agent:${escrowData.to_agent_id}`);
    
    if (!fromAgent || !toAgent) {
      throw new HTTPException(404, {
        message: 'One or both agents not found'
      });
    }
    
    // Get payer's wallet
    const fromWalletId = await c.env.AUTH_STORE.get(`agent:${escrowData.from_agent_id}:wallet`);
    if (!fromWalletId) {
      throw new HTTPException(400, {
        message: 'Payer agent does not have a wallet'
      });
    }
    
    const fromWallet = await c.env.AUTH_STORE.get(`wallet:${fromWalletId}`, 'json');
    if (!fromWallet) {
      throw new HTTPException(400, {
        message: 'Payer wallet not found'
      });
    }
    
    // Check balance
    // In production, this would check actual blockchain balance
    if (fromWallet.balance[escrowData.currency] < escrowData.amount) {
      throw new HTTPException(400, {
        message: 'Insufficient balance for escrow'
      });
    }
    
    // Create escrow record
    const escrow = {
      id: escrowId,
      from_agent_id: escrowData.from_agent_id,
      to_agent_id: escrowData.to_agent_id,
      amount: escrowData.amount,
      currency: escrowData.currency,
      chain: escrowData.chain,
      task_id: escrowData.task_id,
      conditions: escrowData.conditions || {
        release_on_completion: true,
        timeout_seconds: 3600,
        auto_release: false
      },
      status: 'locked' as const,
      metadata: escrowData.metadata,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (escrowData.conditions?.timeout_seconds || 3600) * 1000).toISOString(),
      transaction_hash: null, // Will be set when funds are actually locked
      release_transaction_hash: null
    };
    
    // Lock funds (in production, this would be on-chain)
    const lockTxHash = `0x${crypto.randomUUID().replace(/-/g, '')}`;
    escrow.transaction_hash = lockTxHash;
    
    // Store escrow
    await c.env.ESCROW_STORE.put(
      `escrow:${escrowId}`,
      JSON.stringify(escrow),
      {
        metadata: {
          from_agent_id: escrowData.from_agent_id,
          to_agent_id: escrowData.to_agent_id,
          task_id: escrowData.task_id || '',
          status: 'locked'
        }
      }
    );
    
    // Update wallet balance (deduct escrowed amount)
    fromWallet.balance[escrowData.currency] -= escrowData.amount;
    await c.env.AUTH_STORE.put(
      `wallet:${fromWalletId}`,
      JSON.stringify(fromWallet)
    );
    
    // Set expiration alarm if auto-release is enabled
    if (escrowData.conditions?.auto_release) {
      // In production, this would use Durable Object alarms
      setTimeout(async () => {
        await autoReleaseEscrow(escrowId, c.env);
      }, (escrowData.conditions.timeout_seconds || 3600) * 1000);
    }
    
    return c.json({
      success: true,
      escrow
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Create escrow error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create escrow'
    });
  }
});

// Get escrow details
escrowRouter.get('/:escrowId', async (c) => {
  const escrowId = c.req.param('escrowId');
  
  try {
    const escrow = await c.env.ESCROW_STORE.get(`escrow:${escrowId}`, 'json');
    
    if (!escrow) {
      throw new HTTPException(404, {
        message: 'Escrow not found'
      });
    }
    
    // Check if expired
    if (new Date(escrow.expires_at) < new Date() && escrow.status === 'locked') {
      escrow.status = 'expired';
      await c.env.ESCROW_STORE.put(
        `escrow:${escrowId}`,
        JSON.stringify(escrow)
      );
    }
    
    return c.json({
      success: true,
      escrow
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get escrow error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get escrow'
    });
  }
});

// Release escrow
escrowRouter.post('/release', async (c) => {
  const body = await c.req.json();
  const parseResult = ReleaseEscrowSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const { escrow_id, release_to, reason, partial_amount } = parseResult.data;
  
  try {
    const escrow = await c.env.ESCROW_STORE.get(`escrow:${escrow_id}`, 'json');
    
    if (!escrow) {
      throw new HTTPException(404, {
        message: 'Escrow not found'
      });
    }
    
    if (escrow.status !== 'locked') {
      throw new HTTPException(400, {
        message: `Cannot release escrow in ${escrow.status} status`
      });
    }
    
    // Verify caller is authorized (either party or system)
    const agentId = c.req.header('X-Agent-ID');
    if (agentId && agentId !== escrow.from_agent_id && agentId !== escrow.to_agent_id) {
      throw new HTTPException(403, {
        message: 'Unauthorized to release this escrow'
      });
    }
    
    const releaseAmount = partial_amount || escrow.amount;
    if (releaseAmount > escrow.amount) {
      throw new HTTPException(400, {
        message: 'Release amount exceeds escrow amount'
      });
    }
    
    // Get recipient wallet
    const recipientAgentId = release_to === 'provider' ? escrow.to_agent_id : escrow.from_agent_id;
    const recipientWalletId = await c.env.AUTH_STORE.get(`agent:${recipientAgentId}:wallet`);
    
    if (!recipientWalletId) {
      throw new HTTPException(400, {
        message: 'Recipient does not have a wallet'
      });
    }
    
    const recipientWallet = await c.env.AUTH_STORE.get(`wallet:${recipientWalletId}`, 'json');
    
    // Execute release (in production, this would be on-chain)
    const releaseTxHash = `0x${crypto.randomUUID().replace(/-/g, '')}`;
    
    // Update recipient balance
    recipientWallet.balance[escrow.currency] = (recipientWallet.balance[escrow.currency] || 0) + releaseAmount;
    await c.env.AUTH_STORE.put(
      `wallet:${recipientWalletId}`,
      JSON.stringify(recipientWallet)
    );
    
    // Update escrow status
    escrow.status = release_to === 'provider' ? 'released' : 'refunded';
    escrow.release_transaction_hash = releaseTxHash;
    escrow.released_at = new Date().toISOString();
    escrow.release_reason = reason;
    escrow.released_amount = releaseAmount;
    
    // Handle partial release
    if (partial_amount && partial_amount < escrow.amount) {
      escrow.remaining_amount = escrow.amount - partial_amount;
      escrow.status = 'partially_released';
    }
    
    await c.env.ESCROW_STORE.put(
      `escrow:${escrow_id}`,
      JSON.stringify(escrow)
    );
    
    return c.json({
      success: true,
      escrow,
      transaction_hash: releaseTxHash
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Release escrow error:', error);
    throw new HTTPException(500, {
      message: 'Failed to release escrow'
    });
  }
});

// List escrows
escrowRouter.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  const status = c.req.query('status') as z.infer<typeof EscrowStatusSchema> | undefined;
  const fromAgentId = c.req.query('from_agent_id');
  const toAgentId = c.req.query('to_agent_id');
  const taskId = c.req.query('task_id');
  
  try {
    const list = await c.env.ESCROW_STORE.list({
      prefix: 'escrow:',
      limit: 1000
    });
    
    const escrows = await Promise.all(
      list.keys.map(async (key) => {
        const escrow = await c.env.ESCROW_STORE.get(key.name, 'json');
        return escrow;
      })
    );
    
    // Filter escrows
    let filteredEscrows = escrows.filter(Boolean);
    
    if (status) {
      filteredEscrows = filteredEscrows.filter(e => e.status === status);
    }
    if (fromAgentId) {
      filteredEscrows = filteredEscrows.filter(e => e.from_agent_id === fromAgentId);
    }
    if (toAgentId) {
      filteredEscrows = filteredEscrows.filter(e => e.to_agent_id === toAgentId);
    }
    if (taskId) {
      filteredEscrows = filteredEscrows.filter(e => e.task_id === taskId);
    }
    
    // Sort by creation date (newest first)
    filteredEscrows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // Paginate
    const paginatedEscrows = filteredEscrows.slice(offset, offset + limit);
    
    return c.json({
      success: true,
      escrows: paginatedEscrows,
      pagination: {
        limit,
        offset,
        total: filteredEscrows.length,
        has_more: offset + limit < filteredEscrows.length
      }
    });
  } catch (error) {
    console.error('List escrows error:', error);
    throw new HTTPException(500, {
      message: 'Failed to list escrows'
    });
  }
});

// Cancel escrow (only if not yet released)
escrowRouter.post('/:escrowId/cancel', async (c) => {
  const escrowId = c.req.param('escrowId');
  const body = await c.req.json();
  const reason = body.reason || 'Cancelled by user';
  
  try {
    const escrow = await c.env.ESCROW_STORE.get(`escrow:${escrowId}`, 'json');
    
    if (!escrow) {
      throw new HTTPException(404, {
        message: 'Escrow not found'
      });
    }
    
    if (escrow.status !== 'locked') {
      throw new HTTPException(400, {
        message: `Cannot cancel escrow in ${escrow.status} status`
      });
    }
    
    // Verify caller is authorized
    const agentId = c.req.header('X-Agent-ID');
    if (agentId && agentId !== escrow.from_agent_id) {
      throw new HTTPException(403, {
        message: 'Only the payer can cancel escrow'
      });
    }
    
    // Refund to payer
    const payerWalletId = await c.env.AUTH_STORE.get(`agent:${escrow.from_agent_id}:wallet`);
    const payerWallet = await c.env.AUTH_STORE.get(`wallet:${payerWalletId}`, 'json');
    
    payerWallet.balance[escrow.currency] += escrow.amount;
    await c.env.AUTH_STORE.put(
      `wallet:${payerWalletId}`,
      JSON.stringify(payerWallet)
    );
    
    // Update escrow status
    escrow.status = 'refunded';
    escrow.cancelled_at = new Date().toISOString();
    escrow.cancel_reason = reason;
    
    await c.env.ESCROW_STORE.put(
      `escrow:${escrowId}`,
      JSON.stringify(escrow)
    );
    
    return c.json({
      success: true,
      escrow
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Cancel escrow error:', error);
    throw new HTTPException(500, {
      message: 'Failed to cancel escrow'
    });
  }
});

// Helper function for auto-release
async function autoReleaseEscrow(escrowId: string, env: Env) {
  try {
    const escrow = await env.ESCROW_STORE.get(`escrow:${escrowId}`, 'json');
    
    if (!escrow || escrow.status !== 'locked') {
      return;
    }
    
    // Auto-release to provider
    const recipientWalletId = await env.AUTH_STORE.get(`agent:${escrow.to_agent_id}:wallet`);
    const recipientWallet = await env.AUTH_STORE.get(`wallet:${recipientWalletId}`, 'json');
    
    recipientWallet.balance[escrow.currency] += escrow.amount;
    await env.AUTH_STORE.put(
      `wallet:${recipientWalletId}`,
      JSON.stringify(recipientWallet)
    );
    
    escrow.status = 'released';
    escrow.release_transaction_hash = `0x${crypto.randomUUID().replace(/-/g, '')}`;
    escrow.released_at = new Date().toISOString();
    escrow.release_reason = 'Auto-released after timeout';
    
    await env.ESCROW_STORE.put(
      `escrow:${escrowId}`,
      JSON.stringify(escrow)
    );
  } catch (error) {
    console.error('Auto-release escrow error:', error);
  }
}

export { escrowRouter };