import { BaseService } from './BaseService';
import { WalletBalance, SessionKey, TransferParams } from '../types';

export class WalletService extends BaseService {
  /**
   * Get wallet balance
   */
  async getBalance(agentId: string): Promise<WalletBalance> {
    return this.request<WalletBalance>('GET', `/api/v1/wallets/${agentId}/balance`);
  }

  /**
   * Transfer funds
   */
  async transfer(params: TransferParams): Promise<{ transactionHash: string }> {
    if (!this.config.apiKey) {
      throw new Error('API key is required for transfers');
    }

    return this.request('POST', '/api/v1/wallets/transfer', {
      body: params
    });
  }

  /**
   * Create a session key for delegated transactions
   */
  async createSessionKey(params: {
    spendLimit: string;
    durationHours: number;
    allowedContracts?: string[];
  }): Promise<SessionKey> {
    if (!this.config.apiKey) {
      throw new Error('API key is required to create session keys');
    }

    return this.request<SessionKey>('POST', '/api/v1/wallets/session-key', {
      body: params
    });
  }

  /**
   * Create a new smart wallet
   */
  async createWallet(params?: {
    initialBalance?: string;
    sessionKeyConfig?: {
      spendLimit: string;
      durationHours: number;
      allowedContracts?: string[];
    };
  }): Promise<{
    walletId: string;
    address: string;
    sessionKeys?: SessionKey[];
  }> {
    if (!this.config.apiKey) {
      throw new Error('API key is required to create wallets');
    }

    return this.request('POST', '/api/v1/wallets/create', {
      body: params || {}
    });
  }

  /**
   * Get transaction history
   */
  async getTransactions(
    agentId: string,
    params?: {
      limit?: number;
      offset?: number;
      status?: string;
    }
  ): Promise<{
    transactions: Array<{
      id: string;
      txHash: string;
      from: string;
      to: string;
      value: string;
      token: string;
      status: string;
      timestamp: string;
    }>;
    total: number;
  }> {
    return this.request('GET', `/api/v1/wallets/${agentId}/transactions`, {
      queryParams: params ? {
        ...(params.limit && { limit: params.limit.toString() }),
        ...(params.offset && { offset: params.offset.toString() }),
        ...(params.status && { status: params.status })
      } : undefined
    });
  }
}