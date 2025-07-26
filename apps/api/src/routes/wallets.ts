import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type Env } from '../shared/middleware';

const walletsRouter = new Hono<{ Bindings: Env }>();

// Schemas
const CreateWalletSchema = z.object({
  agent_id: z.string(),
  type: z.enum(['custodial', 'smart-wallet']).default('custodial'),
  chain: z.enum(['base', 'polygon', 'ethereum']).default('base'),
  metadata: z.record(z.string(), z.any()).optional()
});

const TransferSchema = z.object({
  from_wallet_id: z.string(),
  to_wallet_address: z.string(),
  amount: z.number().positive(),
  currency: z.enum(['USDC', 'ETH']).default('USDC'),
  chain: z.enum(['base', 'polygon', 'ethereum']).default('base'),
  memo: z.string().optional()
});

const SessionKeySchema = z.object({
  wallet_id: z.string(),
  permissions: z.object({
    max_amount_per_tx: z.number().positive(),
    max_total_amount: z.number().positive(),
    allowed_contracts: z.array(z.string()).optional(),
    expiry_timestamp: z.number().int().positive()
  }),
  signer_address: z.string()
});

// Create a new wallet
walletsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = CreateWalletSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const { agent_id, type, chain, metadata } = parseResult.data;
  
  try {
    const walletId = crypto.randomUUID();
    
    let wallet;
    
    if (type === 'custodial') {
      // Generate custodial wallet address
      // In production, this would use a proper HD wallet derivation
      const address = `0x${crypto.randomUUID().replace(/-/g, '').substring(0, 40)}`;
      
      wallet = {
        id: walletId,
        agent_id,
        type,
        chain,
        address,
        balance: {
          USDC: 0,
          ETH: 0
        },
        metadata,
        created_at: new Date().toISOString()
      };
    } else {
      // Create smart wallet using Alchemy Account Kit
      // This would integrate with the actual Alchemy SDK
      const smartWalletResponse = await fetch(`${c.env.WORKER_URL}/alchemy/create-smart-wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.ALCHEMY_API_KEY}`
        },
        body: JSON.stringify({
          chain,
          owner: agent_id
        })
      });
      
      if (!smartWalletResponse.ok) {
        throw new Error('Failed to create smart wallet');
      }
      
      const smartWallet = await smartWalletResponse.json();
      
      wallet = {
        id: walletId,
        agent_id,
        type,
        chain,
        address: smartWallet.address,
        smart_contract_address: smartWallet.contractAddress,
        balance: {
          USDC: 0,
          ETH: 0
        },
        metadata,
        created_at: new Date().toISOString()
      };
    }
    
    // Store wallet in KV
    await c.env.AUTH_STORE.put(
      `wallet:${walletId}`,
      JSON.stringify(wallet),
      {
        metadata: {
          agent_id,
          type,
          chain
        }
      }
    );
    
    // Link wallet to agent
    await c.env.AUTH_STORE.put(
      `agent:${agent_id}:wallet`,
      walletId
    );
    
    return c.json({
      success: true,
      wallet
    }, 201);
  } catch (error) {
    console.error('Create wallet error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create wallet'
    });
  }
});

// Get wallet details
walletsRouter.get('/:walletId', async (c) => {
  const walletId = c.req.param('walletId');
  
  try {
    const walletData = await c.env.AUTH_STORE.get(`wallet:${walletId}`, 'json');
    
    if (!walletData) {
      throw new HTTPException(404, {
        message: 'Wallet not found'
      });
    }
    
    // Get current balance from blockchain
    // In production, this would query the actual blockchain
    const balance = await getWalletBalance(walletData.address, walletData.chain, c.env);
    
    return c.json({
      success: true,
      wallet: {
        ...walletData,
        balance
      }
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get wallet error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get wallet'
    });
  }
});

// Transfer funds
walletsRouter.post('/transfer', async (c) => {
  const body = await c.req.json();
  const parseResult = TransferSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const { from_wallet_id, to_wallet_address, amount, currency, chain, memo } = parseResult.data;
  
  try {
    // Get wallet details
    const wallet = await c.env.AUTH_STORE.get(`wallet:${from_wallet_id}`, 'json');
    
    if (!wallet) {
      throw new HTTPException(404, {
        message: 'Wallet not found'
      });
    }
    
    // Check balance
    const balance = await getWalletBalance(wallet.address, chain, c.env);
    
    if (balance[currency] < amount) {
      throw new HTTPException(400, {
        message: 'Insufficient balance'
      });
    }
    
    // Execute transfer based on wallet type
    let txHash;
    
    if (wallet.type === 'custodial') {
      // For custodial wallets, we manage the private keys
      // In production, this would use a secure key management service
      txHash = await executeCustodialTransfer({
        from: wallet.address,
        to: to_wallet_address,
        amount,
        currency,
        chain,
        env: c.env
      });
    } else {
      // For smart wallets, use session keys or user operation
      txHash = await executeSmartWalletTransfer({
        walletAddress: wallet.address,
        smartContractAddress: wallet.smart_contract_address,
        to: to_wallet_address,
        amount,
        currency,
        chain,
        env: c.env
      });
    }
    
    // Record transaction
    const transaction = {
      id: crypto.randomUUID(),
      wallet_id: from_wallet_id,
      type: 'transfer',
      direction: 'outgoing',
      amount,
      currency,
      chain,
      to_address: to_wallet_address,
      tx_hash: txHash,
      memo,
      status: 'completed',
      created_at: new Date().toISOString()
    };
    
    await c.env.PAYMENT_SESSIONS.put(
      `transaction:${transaction.id}`,
      JSON.stringify(transaction),
      {
        metadata: {
          wallet_id: from_wallet_id,
          type: 'transfer'
        }
      }
    );
    
    return c.json({
      success: true,
      transaction
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Transfer error:', error);
    throw new HTTPException(500, {
      message: 'Failed to execute transfer'
    });
  }
});

// Create session key for smart wallet
walletsRouter.post('/session-keys', async (c) => {
  const body = await c.req.json();
  const parseResult = SessionKeySchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const { wallet_id, permissions, signer_address } = parseResult.data;
  
  try {
    // Get wallet details
    const wallet = await c.env.AUTH_STORE.get(`wallet:${wallet_id}`, 'json');
    
    if (!wallet) {
      throw new HTTPException(404, {
        message: 'Wallet not found'
      });
    }
    
    if (wallet.type !== 'smart-wallet') {
      throw new HTTPException(400, {
        message: 'Session keys are only available for smart wallets'
      });
    }
    
    // Create session key using Alchemy Account Kit
    const sessionKeyResponse = await fetch(`${c.env.WORKER_URL}/alchemy/create-session-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.ALCHEMY_API_KEY}`
      },
      body: JSON.stringify({
        smartWalletAddress: wallet.smart_contract_address,
        signerAddress: signer_address,
        permissions
      })
    });
    
    if (!sessionKeyResponse.ok) {
      throw new Error('Failed to create session key');
    }
    
    const sessionKey = await sessionKeyResponse.json();
    
    // Store session key
    await c.env.AUTH_STORE.put(
      `session-key:${sessionKey.id}`,
      JSON.stringify({
        ...sessionKey,
        wallet_id,
        created_at: new Date().toISOString()
      }),
      {
        expirationTtl: permissions.expiry_timestamp - Math.floor(Date.now() / 1000)
      }
    );
    
    return c.json({
      success: true,
      session_key: sessionKey
    }, 201);
  } catch (error) {
    console.error('Create session key error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create session key'
    });
  }
});

// Get wallet transactions
walletsRouter.get('/:walletId/transactions', async (c) => {
  const walletId = c.req.param('walletId');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  
  try {
    // Check wallet exists
    const wallet = await c.env.AUTH_STORE.get(`wallet:${walletId}`, 'json');
    
    if (!wallet) {
      throw new HTTPException(404, {
        message: 'Wallet not found'
      });
    }
    
    // Get transactions from KV
    const prefix = `transaction:`;
    const list = await c.env.PAYMENT_SESSIONS.list({
      prefix,
      limit: 1000 // Get all to filter
    });
    
    // Filter transactions for this wallet
    const transactions = [];
    for (const key of list.keys) {
      const tx = await c.env.PAYMENT_SESSIONS.get(key.name, 'json');
      if (tx && tx.wallet_id === walletId) {
        transactions.push(tx);
      }
    }
    
    // Sort by created_at descending
    transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    // Paginate
    const paginatedTransactions = transactions.slice(offset, offset + limit);
    
    return c.json({
      success: true,
      transactions: paginatedTransactions,
      pagination: {
        limit,
        offset,
        total: transactions.length,
        has_more: offset + limit < transactions.length
      }
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get transactions error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get transactions'
    });
  }
});

// Helper functions
async function getWalletBalance(address: string, chain: string, env: Env) {
  // In production, this would query the actual blockchain
  // For now, return mock balance
  return {
    USDC: 1000,
    ETH: 0.5
  };
}

async function executeCustodialTransfer(params: any) {
  // In production, this would execute actual blockchain transaction
  return `0x${crypto.randomUUID().replace(/-/g, '')}`;
}

async function executeSmartWalletTransfer(params: any) {
  // In production, this would use Alchemy Account Kit to execute UserOp
  return `0x${crypto.randomUUID().replace(/-/g, '')}`;
}

export { walletsRouter };