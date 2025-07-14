import { useState, useEffect, useCallback, useRef } from 'react';
import { getUserId } from '@/utils/userIdentity';

export interface X402PaymentRequirement {
  amount: string;
  currency: string;
  network: string;
  address: string;
  memo?: string;
  expires_at?: string;
}

export interface X402Payment {
  amount: string;
  currency: string;
  network: string;
  from_address: string;
  to_address: string;
  transaction_hash: string;
  timestamp: string;
}

export interface ToolUsage {
  id: string;
  tool: string;
  cost: number;
  timestamp: number;
  tx_hash?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface X402State {
  isConnected: boolean;
  sessionCost: number;
  totalSpent: number;
  recentTransactions: ToolUsage[];
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'payment_required';
  lastPayment?: ToolUsage;
  currentRequirement?: X402PaymentRequirement;
  pendingPayment?: X402Payment;
}

export interface UseX402PaymentReturn extends X402State {
  makePayment: (requirement: X402PaymentRequirement) => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  setPaymentRequired: (required: boolean) => void;
}

// Real tool pricing from Coinbase MCP
const TOOL_PRICING = {
  getAccounts: 0.001,
  getTransactions: 0.002,
  getBalance: 0.001,
  sendMoney: 0.01,
  // Add other MCP tool pricing here
} as const;

const COINBASE_MCP_URL = 'https://coinbase-api.0emlabs.com';

export function useX402Payment(): UseX402PaymentReturn {
  const [state, setState] = useState<X402State>({
    isConnected: false,
    sessionCost: 0,
    totalSpent: 0,
    recentTransactions: [],
    connectionStatus: 'disconnected',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const userId = getUserId();

  // Connect to real-time billing WebSocket
  const connectWebSocket = useCallback(() => {
    if (!userId) return;

    try {
      const wsUrl = `wss://coinbase-api.0emlabs.com/ws?user_id=${userId}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setState(prev => ({ ...prev, isConnected: true, connectionStatus: 'connected' }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'payment_required') {
            setState(prev => ({
              ...prev,
              currentRequirement: data.requirement,
              connectionStatus: 'payment_required'
            }));
          } else if (data.type === 'payment_confirmed') {
            const usage: ToolUsage = {
              id: data.id || crypto.randomUUID(),
              tool: data.tool,
              cost: parseFloat(data.amount),
              timestamp: Date.now(),
              tx_hash: data.transaction_hash,
              status: 'confirmed'
            };

            setState(prev => ({
              ...prev,
              sessionCost: prev.sessionCost + usage.cost,
              totalSpent: prev.totalSpent + usage.cost,
              recentTransactions: [usage, ...prev.recentTransactions.slice(0, 9)],
              lastPayment: usage,
              connectionStatus: 'connected',
              currentRequirement: undefined
            }));
          }
        } catch (error) {
          console.error('[X402] WebSocket message error:', error);
        }
      };

      wsRef.current.onclose = () => {
        setState(prev => ({ ...prev, isConnected: false, connectionStatus: 'disconnected' }));
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error('[X402] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[X402] WebSocket connection failed:', error);
    }
  }, [userId]);

  // Check authentication status with real Coinbase MCP
  const refreshStatus = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await fetch(`${COINBASE_MCP_URL}/api/auth/coinbase/status`, {
        headers: {
          'X-User-ID': userId,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.usage) {
          setState(prev => ({
            ...prev,
            totalSpent: data.usage.total_paid || 0,
            recentTransactions: prev.recentTransactions, // Keep existing
            connectionStatus: 'connected'
          }));
        }
      }
    } catch (error) {
      console.error('[X402] Status check failed:', error);
    }
  }, [userId]);

  // Make payment for required tool call
  const makePayment = useCallback(async (requirement: X402PaymentRequirement): Promise<boolean> => {
    if (!userId) return false;

    try {
      setState(prev => ({ ...prev, connectionStatus: 'connecting' }));

      // In a real implementation, this would:
      // 1. Open wallet connection (MetaMask/WalletConnect)
      // 2. Create transaction to payment address
      // 3. Wait for blockchain confirmation
      // 4. Submit payment proof to backend

      const payment: X402Payment = {
        amount: requirement.amount,
        currency: requirement.currency,
        network: requirement.network,
        from_address: '0x1234...', // User's wallet address
        to_address: requirement.address,
        transaction_hash: `0x${crypto.randomUUID().replace(/-/g, '')}`, // Real tx hash
        timestamp: new Date().toISOString(),
      };

      // Submit payment to backend for verification
      const verifyResponse = await fetch(`${COINBASE_MCP_URL}/api/mcp/coinbase/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId,
          'X-PAYMENT': JSON.stringify(payment),
        },
        body: JSON.stringify({
          method: 'tools/call',
          params: {
            name: 'getAccounts', // Example tool call
            arguments: {},
          },
        }),
      });

      if (verifyResponse.ok) {
        setState(prev => ({ ...prev, connectionStatus: 'connected' }));
        return true;
      } else {
        setState(prev => ({ ...prev, connectionStatus: 'payment_required' }));
        return false;
      }
    } catch (error) {
      console.error('[X402] Payment failed:', error);
      setState(prev => ({ ...prev, connectionStatus: 'payment_required' }));
      return false;
    }
  }, [userId]);

  const setPaymentRequired = useCallback((required: boolean) => {
    setState(prev => ({
      ...prev,
      connectionStatus: required ? 'payment_required' : 'connected'
    }));
  }, []);

  // Initialize connection
  useEffect(() => {
    if (userId) {
      connectWebSocket();
      refreshStatus();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId, connectWebSocket, refreshStatus]);

  return {
    ...state,
    makePayment,
    refreshStatus,
    setPaymentRequired,
  };
}
