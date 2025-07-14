import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import X402PaymentDialog from '../X402PaymentDialog';
import { ThemeProvider } from '@/context/ThemeContext';

// Mock props
const mockProps = {
  open: true,
  onOpenChange: vi.fn(),
  tool: 'getAccounts',
  amount: 0.001,
  onPaymentComplete: vi.fn(),
  onPaymentError: vi.fn(),
};

// Mock the useX402Payment hook
const mockUseX402Payment = {
  isConnected: true,
  sessionCost: 0.025,
  totalSpent: 0.125,
  recentTransactions: [],
  connectionStatus: 'connected' as const,
  lastPayment: null,
  currentRequirement: {
    amount: '0.001',
    currency: 'USDC',
    network: 'base',
    address: '0x123...abc',
    memo: 'payment-123',
    expires_at: new Date(Date.now() + 300000).toISOString(),
  },
  refreshStatus: vi.fn(),
  processPayment: vi.fn().mockResolvedValue({ success: true }),
  isProcessing: false,
  error: null,
};

vi.mock('@/hooks/useX402Payment', () => ({
  useX402Payment: () => mockUseX402Payment,
}));

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  Wallet: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="wallet-icon" />
  ),
  CheckCircle: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="check-circle-icon" />
  ),
  AlertCircle: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="alert-circle-icon" />
  ),
  Clock: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="clock-icon" />
  ),
  ExternalLink: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="external-link-icon" />
  ),
  Copy: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="copy-icon" />
  ),
  DollarSign: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="dollar-sign-icon" />
  ),
  X: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="x-icon" />
  ),
  CreditCard: ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg className={className} {...props} data-testid="credit-card-icon" />
  ),
}));

// Mock UI components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (
    open ? <div data-testid="dialog">{children}</div> : null
  ),
  DialogContent: ({ children, className }: any) => (
    <div className={className} data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children, className }: any) => (
    <div className={className} data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children, className }: any) => (
    <h2 className={className} data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children, className }: any) => (
    <p className={className} data-testid="dialog-description">{children}</p>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, disabled, variant, ...props }: any) => (
    <button
      onClick={onClick}
      className={className}
      disabled={disabled}
      data-variant={variant}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => (
    <span className={className} data-variant={variant} data-testid="badge">{children}</span>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  CardContent: ({ children, className }: any) => (
    <div className={className} data-testid="card-content">{children}</div>
  ),
}));

vi.mock('@/components/ui/progress', () => ({
  Progress: ({ value, className }: any) => (
    <div className={className} data-testid="progress" data-value={value}>
      Progress: {value}%
    </div>
  ),
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <ThemeProvider>
      {children}
    </ThemeProvider>
  </BrowserRouter>
);

describe('X402PaymentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rendering', () => {
    it('should render when open is true', () => {
      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-title')).toBeInTheDocument();
    });

    it('should not render when open is false', () => {
      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} open={false} />
        </TestWrapper>
      );

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('should display tool and amount information', () => {
      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      expect(screen.getByText('x402 Payment Required')).toBeInTheDocument();
      expect(screen.getByText('getAccounts')).toBeInTheDocument();
      expect(screen.getByText('$0.001')).toBeInTheDocument();
    });
  });

  describe('Payment State Management', () => {
    it('should show payment requirement details when currentRequirement exists', () => {
      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      expect(screen.getByText('0.001 USDC')).toBeInTheDocument();
      expect(screen.getByText('Base Network')).toBeInTheDocument();
      expect(screen.getByText('0x123...abc')).toBeInTheDocument();
    });

    it('should handle processing state', () => {
      const processingHook = {
        ...mockUseX402Payment,
        isProcessing: true,
      };

      vi.mocked(require('@/hooks/useX402Payment').useX402Payment).mockReturnValue(processingHook);

      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Processing Payment...')).toBeInTheDocument();
    });
  });

  describe('Payment Actions', () => {
    it('should call processPayment when confirm payment button is clicked', async () => {
      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      const confirmButton = screen.getByText('Confirm Payment');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockUseX402Payment.processPayment).toHaveBeenCalledWith(
          mockProps.tool,
          mockProps.amount
        );
      });
    });

    it('should call onOpenChange when cancel button is clicked', () => {
      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Payment Completion', () => {
    it('should show success state and call onPaymentComplete', async () => {
      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      const confirmButton = screen.getByText('Confirm Payment');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockProps.onPaymentComplete).toHaveBeenCalled();
      });
    });

    it('should handle payment errors gracefully', async () => {
      const errorHook = {
        ...mockUseX402Payment,
        processPayment: vi.fn().mockRejectedValue(new Error('Payment failed')),
      };

      vi.mocked(require('@/hooks/useX402Payment').useX402Payment).mockReturnValue(errorHook);

      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      const confirmButton = screen.getByText('Confirm Payment');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockProps.onPaymentError).toHaveBeenCalledWith('Payment failed');
      });
    });
  });

  describe('Progress Tracking', () => {
    it('should show payment progress when processing', () => {
      const processingHook = {
        ...mockUseX402Payment,
        isProcessing: true,
      };

      vi.mocked(require('@/hooks/useX402Payment').useX402Payment).mockReturnValue(processingHook);

      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });
  });

  describe('Address Copy Functionality', () => {
    it('should allow copying payment address', () => {
      // Mock clipboard
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn(),
        },
      });

      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      const copyButton = screen.getByTestId('copy-icon').parentElement;
      if (copyButton) {
        fireEvent.click(copyButton);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0x123...abc');
      }
    });
  });

  describe('Error Handling', () => {
    it('should display error state when payment fails', () => {
      const errorHook = {
        ...mockUseX402Payment,
        error: 'Network connection failed',
      };

      vi.mocked(require('@/hooks/useX402Payment').useX402Payment).mockReturnValue(errorHook);

      render(
        <TestWrapper>
          <X402PaymentDialog {...mockProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Network connection failed')).toBeInTheDocument();
      expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
    });
  });
});
