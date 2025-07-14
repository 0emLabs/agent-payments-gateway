import { paymentMiddleware as officialPaymentMiddleware } from 'x402-hono';
import type { PaymentPayload, PaymentRequirements, VerifyResponse, SettleResponse } from 'x402/types';

// X402 Configuration interface for compatibility
export interface X402Config {
  paymentAmount: string;
  token: string;
  network: string;
  paymentDestination: string;
  x402Version?: number;
  facilitatorUrl?: string;
}

// Official X402 middleware wrapper for legacy config
export function x402Middleware(config: X402Config): any {
  const routes = {
    '/paid/*': {
      price: `$${parseFloat(config.paymentAmount) / 1000000}`,
      network: config.network as 'base-sepolia' | 'base',
    },
  };
  const facilitatorConfig = config.facilitatorUrl ? { url: config.facilitatorUrl as `${string}://${string}` } : undefined;
  return officialPaymentMiddleware(
    config.paymentDestination as `0x${string}`,
    routes,
    facilitatorConfig
  );
}

// Re-export types for compatibility
export type { PaymentPayload, PaymentRequirements, VerifyResponse, SettleResponse };
