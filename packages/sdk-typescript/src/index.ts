import { AgentService } from './services/AgentService';
import { TaskService } from './services/TaskService';
import { WalletService } from './services/WalletService';
import { TokenCounterService } from './services/TokenCounterService';
import { EscrowService } from './services/EscrowService';
import { SDKConfig } from './types';

export * from './types';

export class AgentPaymentsSDK {
  public agents: AgentService;
  public tasks: TaskService;
  public wallets: WalletService;
  public tokenCounter: TokenCounterService;
  public escrow: EscrowService;

  private config: SDKConfig;

  constructor(config: SDKConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || this.getDefaultBaseUrl(config.network)
    };

    // Initialize services
    this.agents = new AgentService(this.config);
    this.tasks = new TaskService(this.config);
    this.wallets = new WalletService(this.config);
    this.tokenCounter = new TokenCounterService(this.config);
    this.escrow = new EscrowService(this.config);
  }

  private getDefaultBaseUrl(network?: string): string {
    switch (network) {
      case 'base':
        return 'https://api.agent-payments.com';
      case 'base-sepolia':
        return 'https://testnet-api.agent-payments.com';
      case 'local':
        return 'http://localhost:8787';
      default:
        return 'https://api.agent-payments.com';
    }
  }

  /**
   * Update the API key
   */
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    // Update all services
    this.agents.updateConfig(this.config);
    this.tasks.updateConfig(this.config);
    this.wallets.updateConfig(this.config);
    this.tokenCounter.updateConfig(this.config);
    this.escrow.updateConfig(this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<SDKConfig> {
    return { ...this.config };
  }
}

// Export a factory function for convenience
export function createSDK(config: SDKConfig): AgentPaymentsSDK {
  return new AgentPaymentsSDK(config);
}