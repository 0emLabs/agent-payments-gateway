import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useX402Payment } from '../useX402Payment';

// Mock getUserId utility
vi.mock('@/utils/userIdentity', () => ({
  getUserId: () => 'test-user-123',
}));

// Mock WebSocket
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: WebSocket.OPEN,
};

global.WebSocket = vi.fn(() => mockWebSocket) as any;

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
});

// Mock console to avoid noise in tests
console.error = vi.fn();
console.warn = vi.fn();

describe('useX402Payment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
      sessionCost: 0.025,
      totalSpent: 0.125,
      recentTransactions: [],
    }));

    // Mock successful fetch response
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        connected: true,
        sessionCost: 0.025,
        totalSpent: 0.125,
        recentTransactions: [],
      }),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useX402Payment());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.sessionCost).toBe(0);
    expect(result.current.totalSpent).toBe(0);
    expect(result.current.recentTransactions).toEqual([]);
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('loads persisted data from localStorage on mount', async () => {
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
      sessionCost: 0.025,
      totalSpent: 0.125,
      recentTransactions: [
        { id: '1', tool: 'getAccounts', cost: 0.001, timestamp: Date.now(), status: 'confirmed' }
      ],
    }));

    const { result } = renderHook(() => useX402Payment());

    await waitFor(() => {
      expect(result.current.sessionCost).toBe(0.025);
      expect(result.current.totalSpent).toBe(0.125);
      expect(result.current.recentTransactions).toHaveLength(1);
    });
  });

  it('establishes WebSocket connection on mount', () => {
    renderHook(() => useX402Payment());

    expect(WebSocket).toHaveBeenCalledWith(
      expect.stringContaining('/api/x402/realtime')
    );
    expect(mockWebSocket.addEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );
  });

  it('handles WebSocket messages correctly', async () => {
    let messageHandler: ((event: MessageEvent) => void) | undefined;

    mockWebSocket.addEventListener.mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });

    const { result } = renderHook(() => useX402Payment());

    expect(messageHandler).toBeDefined();

    // Simulate incoming WebSocket message
    const mockEvent = {
      data: JSON.stringify({
        type: 'usage_update',
        data: {
          sessionCost: 0.030,
          totalSpent: 0.130,
          lastPayment: { id: '2', tool: 'sendMoney', cost: 0.01, timestamp: Date.now(), status: 'confirmed' }
        }
      })
    } as MessageEvent;

    act(() => {
      messageHandler!(mockEvent);
    });

    await waitFor(() => {
      expect(result.current.sessionCost).toBe(0.030);
      expect(result.current.totalSpent).toBe(0.130);
    });
  });

  it('makes payment correctly', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        transaction_hash: '0xhash123',
        amount: '0.001',
      }),
    });

    const { result } = renderHook(() => useX402Payment());

    await act(async () => {
      const paymentResult = await result.current.makePayment('getAccounts', 0.001);
      expect(paymentResult.success).toBe(true);
      expect(paymentResult.transaction_hash).toBe('0xhash123');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/x402/pay',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-User-ID': 'test-user-123',
        }),
        body: JSON.stringify({
          tool: 'getAccounts',
          amount: 0.001,
        }),
      })
    );
  });

  it('handles payment errors', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 402,
      json: () => Promise.resolve({
        error: 'Insufficient funds',
        payment_required: true,
      }),
    });

    const { result } = renderHook(() => useX402Payment());

    await act(async () => {
      const paymentResult = await result.current.makePayment('getAccounts', 0.001);
      expect(paymentResult.success).toBe(false);
      expect(paymentResult.error).toBe('Insufficient funds');
    });

    expect(result.current.connectionStatus).toBe('payment_required');
  });

  it('refreshes status from backend', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        connected: true,
        sessionCost: 0.050,
        totalSpent: 0.200,
        recentTransactions: [
          { id: '1', tool: 'getAccounts', cost: 0.001, timestamp: Date.now(), status: 'confirmed' }
        ],
      }),
    });

    const { result } = renderHook(() => useX402Payment());

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.sessionCost).toBe(0.050);
    expect(result.current.totalSpent).toBe(0.200);
    expect(result.current.recentTransactions).toHaveLength(1);
  });

  it('sets payment required state', () => {
    const { result } = renderHook(() => useX402Payment());

    const requirement = {
      amount: '0.001',
      currency: 'USDC',
      network: 'base',
      address: '0x123',
    };

    act(() => {
      result.current.setPaymentRequired(requirement);
    });

    expect(result.current.currentRequirement).toEqual(requirement);
    expect(result.current.connectionStatus).toBe('payment_required');
  });

  it('persists data to localStorage when state changes', async () => {
    const { result } = renderHook(() => useX402Payment());

    // Simulate state change
    act(() => {
      result.current.setPaymentRequired({
        amount: '0.001',
        currency: 'USDC',
        network: 'base',
        address: '0x123',
      });
    });

    await waitFor(() => {
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'x402-payment-state',
        expect.stringContaining('payment_required')
      );
    });
  });

  it('cleans up WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useX402Payment());

    unmount();

    expect(mockWebSocket.close).toHaveBeenCalled();
    expect(mockWebSocket.removeEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );
  });

  it('handles network errors gracefully', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useX402Payment());

    await act(async () => {
      const paymentResult = await result.current.makePayment('getAccounts', 0.001);
      expect(paymentResult.success).toBe(false);
      expect(paymentResult.error).toContain('Network error');
    });
  });

  it('retries failed connections', async () => {
    let connectionAttempts = 0;
    mockWebSocket.addEventListener.mockImplementation((event, handler) => {
      if (event === 'error') {
        connectionAttempts++;
        // Simulate WebSocket error
        setTimeout(() => handler(new Event('error')), 10);
      }
    });

    renderHook(() => useX402Payment());

    await waitFor(() => {
      expect(connectionAttempts).toBeGreaterThan(0);
    }, { timeout: 1000 });
  });
});
