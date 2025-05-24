import { Env } from '../types/env';
import { Address, Hex, parseUnits, encodeFunctionData } from 'viem';
import { generateWalletId } from '../utils/crypto';

export interface SmartWalletConfig {
  agentId: string;
  email?: string;
  initialBalance?: string;
  sessionKeyConfig?: {
    spendLimit: string;
    durationHours: number;
    allowedContracts?: Address[];
  };
}

export interface SmartWallet {
  walletId: string;
  agentId: string;
  address: Address;
  type: 'eoa' | 'smart' | 'delegated';
  createdAt: string;
  sessionKeys?: SessionKey[];
}

export interface SessionKey {
  id: string;
  address: Address;
  permissions: {
    spendLimit: string;
    validFrom: number;
    validUntil: number;
    allowedContracts: Address[];
  };
  isActive: boolean;
  createdAt: string;
}

export interface TransactionRequest {
  to: Address;
  value?: string;
  data?: Hex;
  gasLimit?: string;
}

export class WalletService {
  private env: Env;
  private alchemyApiKey: string;
  private baseUrl: string;

  constructor(env: Env) {
    this.env = env;
    this.alchemyApiKey = env.ALCHEMY_API_KEY || '';
    this.baseUrl = env.ALCHEMY_AA_URL || 'https://api.g.alchemy.com/v1/aa';
  }

  /**
   * Create a smart wallet for an agent
   */
  async createSmartWallet(config: SmartWalletConfig): Promise<SmartWallet> {
    try {
      const walletId = generateWalletId();
      
      // Generate deterministic address based on agent ID
      // In production, this would use Alchemy's Account Kit API
      const walletAddress = this.generateDeterministicAddress(config.agentId);

      // Create wallet record
      const wallet: SmartWallet = {
        walletId,
        agentId: config.agentId,
        address: walletAddress,
        type: 'smart',
        createdAt: new Date().toISOString(),
        sessionKeys: []
      };

      // Store wallet data in KV
      await this.env.WALLET_STORE.put(
        `wallet:${config.agentId}`,
        JSON.stringify(wallet)
      );

      // Initialize with balance if provided
      if (config.initialBalance) {
        await this.fundWallet(walletAddress, config.initialBalance);
      }

      // Create session key if requested
      if (config.sessionKeyConfig) {
        const sessionKey = await this.createSessionKey(
          wallet,
          config.sessionKeyConfig
        );
        wallet.sessionKeys = [sessionKey];
      }

      // Log wallet creation
      await this.logWalletCreation(wallet);

      return wallet;
    } catch (error) {
      console.error('[WalletService] Create wallet error:', error);
      throw error;
    }
  }

  /**
   * Create a session key for delegated transactions
   */
  async createSessionKey(
    wallet: SmartWallet,
    config: {
      spendLimit: string;
      durationHours: number;
      allowedContracts?: Address[];
    }
  ): Promise<SessionKey> {
    try {
      // Generate session key address
      const sessionKeyAddress = this.generateSessionKeyAddress(wallet.walletId);
      
      const validFrom = Math.floor(Date.now() / 1000);
      const validUntil = validFrom + (config.durationHours * 3600);

      const sessionKey: SessionKey = {
        id: `sk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        address: sessionKeyAddress,
        permissions: {
          spendLimit: config.spendLimit,
          validFrom,
          validUntil,
          allowedContracts: config.allowedContracts || []
        },
        isActive: true,
        createdAt: new Date().toISOString()
      };

      // Store session key
      await this.env.WALLET_STORE.put(
        `session:${sessionKey.id}`,
        JSON.stringify(sessionKey)
      );

      return sessionKey;
    } catch (error) {
      console.error('[WalletService] Create session key error:', error);
      throw error;
    }
  }

  /**
   * Execute a transaction using the smart wallet
   */
  async executeTransaction(
    agentId: string,
    transaction: TransactionRequest,
    sessionKeyId?: string
  ): Promise<{ hash: string; status: 'pending' | 'confirmed' | 'failed' }> {
    try {
      const wallet = await this.getWallet(agentId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Validate session key if provided
      if (sessionKeyId) {
        const sessionKey = wallet.sessionKeys?.find(sk => sk.id === sessionKeyId);
        if (!sessionKey || !sessionKey.isActive) {
          throw new Error('Invalid or inactive session key');
        }

        // Check permissions
        if (!this.validateSessionKeyPermissions(sessionKey, transaction)) {
          throw new Error('Transaction exceeds session key permissions');
        }
      }

      // In production, this would use Alchemy's AA API to send UserOperation
      // For now, simulate transaction
      const txHash = `0x${Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;

      // Log transaction
      await this.logTransaction({
        walletId: wallet.walletId,
        agentId,
        txHash,
        to: transaction.to,
        value: transaction.value || '0',
        sessionKeyId,
        timestamp: new Date().toISOString()
      });

      return {
        hash: txHash,
        status: 'pending'
      };
    } catch (error) {
      console.error('[WalletService] Execute transaction error:', error);
      throw error;
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(agentId: string): Promise<{ native: string; usdc: string }> {
    try {
      const wallet = await this.getWallet(agentId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // In production, query on-chain balance
      // For now, return from KV storage
      const balanceKey = `balance:${wallet.address}`;
      const balance = await this.env.WALLET_STORE.get(balanceKey);
      
      if (balance) {
        return JSON.parse(balance);
      }

      return { native: '0', usdc: '0' };
    } catch (error) {
      console.error('[WalletService] Get balance error:', error);
      throw error;
    }
  }

  /**
   * Transfer funds between wallets
   */
  async transfer(
    fromAgentId: string,
    toAddress: Address,
    amount: string,
    token: 'native' | 'usdc' = 'usdc'
  ): Promise<string> {
    try {
      const wallet = await this.getWallet(fromAgentId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      let transaction: TransactionRequest;

      if (token === 'usdc') {
        // ERC20 transfer
        const usdcAddress = this.getUSDCAddress();
        const transferData = encodeFunctionData({
          abi: [{
            name: 'transfer',
            type: 'function',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }],
          functionName: 'transfer',
          args: [toAddress, parseUnits(amount, 6)] // USDC has 6 decimals
        });

        transaction = {
          to: usdcAddress,
          data: transferData,
          value: '0'
        };
      } else {
        // Native token transfer
        transaction = {
          to: toAddress,
          value: parseUnits(amount, 18).toString()
        };
      }

      const result = await this.executeTransaction(fromAgentId, transaction);
      return result.hash;
    } catch (error) {
      console.error('[WalletService] Transfer error:', error);
      throw error;
    }
  }

  // Private helper methods
  private async getWallet(agentId: string): Promise<SmartWallet | null> {
    const data = await this.env.WALLET_STORE.get(`wallet:${agentId}`);
    return data ? JSON.parse(data) : null;
  }

  private generateDeterministicAddress(agentId: string): Address {
    // In production, use CREATE2 or Alchemy's deterministic address generation
    // For now, generate a pseudo-random address based on agent ID
    const hash = Array.from(
      new TextEncoder().encode(agentId)
    ).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
    
    return `0x${hash.padEnd(40, '0').slice(0, 40)}` as Address;
  }

  private generateSessionKeyAddress(walletId: string): Address {
    // Generate deterministic session key address
    const hash = Array.from(
      new TextEncoder().encode(`session_${walletId}`)
    ).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
    
    return `0x${hash.padEnd(40, '0').slice(0, 40)}` as Address;
  }

  private validateSessionKeyPermissions(
    sessionKey: SessionKey,
    transaction: TransactionRequest
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    
    // Check time validity
    if (now < sessionKey.permissions.validFrom || now > sessionKey.permissions.validUntil) {
      return false;
    }

    // Check contract allowlist
    if (sessionKey.permissions.allowedContracts.length > 0) {
      if (!sessionKey.permissions.allowedContracts.includes(transaction.to)) {
        return false;
      }
    }

    // Check spend limit (simplified - in production, track cumulative spending)
    if (transaction.value) {
      const value = BigInt(transaction.value);
      const limit = parseUnits(sessionKey.permissions.spendLimit, 6);
      if (value > limit) {
        return false;
      }
    }

    return true;
  }

  private async fundWallet(address: Address, amount: string): Promise<void> {
    // In production, this would transfer from a treasury wallet
    // For now, just update the balance in KV
    const balanceKey = `balance:${address}`;
    await this.env.WALLET_STORE.put(
      balanceKey,
      JSON.stringify({ native: '0', usdc: amount })
    );
  }

  private getUSDCAddress(): Address {
    // Return USDC address based on chain
    // Default to Base mainnet USDC
    return '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
  }

  private async logWalletCreation(wallet: SmartWallet): Promise<void> {
    try {
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        INSERT INTO wallets (wallet_id, agent_id, address, type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      await stmt.bind(
        wallet.walletId,
        wallet.agentId,
        wallet.address,
        wallet.type,
        wallet.createdAt
      ).run();
    } catch (error) {
      console.error('[WalletService] Failed to log wallet creation:', error);
    }
  }

  private async logTransaction(tx: any): Promise<void> {
    try {
      const stmt = this.env.MARKETPLACE_DB.prepare(`
        INSERT INTO wallet_transactions (
          wallet_id, agent_id, tx_hash, to_address, value, 
          session_key_id, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      await stmt.bind(
        tx.walletId,
        tx.agentId,
        tx.txHash,
        tx.to,
        tx.value,
        tx.sessionKeyId || null,
        tx.timestamp
      ).run();
    } catch (error) {
      console.error('[WalletService] Failed to log transaction:', error);
    }
  }
}