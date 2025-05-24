import { ClientTokenCounter } from './tokenCounter';

interface AgentPaymentsSDKConfig {
  baseUrl: string;
}

export class AgentPaymentsSDK {
  public tokenCounter: ClientTokenCounter;

  constructor(config: AgentPaymentsSDKConfig) {
    this.tokenCounter = new ClientTokenCounter(config.baseUrl);
  }

  // Add more SDK methods here later, e.g., for agent management, task management, etc.
}
