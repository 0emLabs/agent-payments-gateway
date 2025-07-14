import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  CreditCard,
  Wallet,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  Copy,
  DollarSign,
  X
} from 'lucide-react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useX402Payment, X402PaymentRequirement } from '@/hooks/useX402Payment';

interface X402PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: string;
  amount: number;
  onPaymentComplete?: () => void;
  onPaymentError?: (error: string) => void;
}

export const X402PaymentDialog: React.FC<X402PaymentDialogProps> = ({
  open,
  onOpenChange,
  tool,
  amount,
  onPaymentComplete,
  onPaymentError
}) => {
  const {
    currentRequirement,
    connectionStatus,
    makePayment,
    setPaymentRequired
  } = useX402Payment();

  const { login, logout, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');

  const walletConnected = authenticated && wallets.length > 0;

  // Create payment requirement for this tool
  const paymentRequirement: X402PaymentRequirement = {
    amount: amount.toString(),
    currency: 'USDC',
    network: 'base',
    address: '0x742f35Cc6634C0532925a3b8b11a27700E2e2B04', // 0EM Labs treasury
    memo: `Payment for ${tool} tool call`,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
  };

  // Calculate time until payment expires
  useEffect(() => {
    if (paymentRequirement.expires_at) {
      const interval = setInterval(() => {
        const now = Date.now();
        const expires = new Date(paymentRequirement.expires_at!).getTime();
        const remaining = Math.max(0, expires - now);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
          setPaymentStatus('error');
          setError('Payment expired');
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [paymentRequirement.expires_at]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleConnectWallet = async () => {
    try {
      await login();
    } catch (error) {
      setError('Failed to connect wallet');
    }
  };

  const handlePayment = async () => {
    if (!walletConnected) {
      await handleConnectWallet();
      return;
    }

    setPaymentStatus('pending');
    setError('');

    try {
      // Get the first connected wallet
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('No wallet available');
      }

      const success = await makePayment(paymentRequirement);

      if (success) {
        setPaymentStatus('success');
        // Generate mock transaction hash for demonstration
        const mockTxHash = `0x${crypto.randomUUID().replace(/-/g, '')}`;
        setTxHash(mockTxHash);
        onPaymentComplete?.();
      } else {
        setPaymentStatus('error');
        setError('Payment failed. Please try again.');
        onPaymentError?.('Payment failed');
      }
    } catch (error) {
      setPaymentStatus('error');
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      setError(errorMessage);
      onPaymentError?.(errorMessage);
    }
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(paymentRequirement.address);
  };

  const handleClose = () => {
    setPaymentStatus('idle');
    setError('');
    setTxHash('');
    setWalletConnected(false);
    onOpenChange(false);
  };

  const getStatusIcon = () => {
    switch (paymentStatus) {
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <CreditCard className="h-5 w-5 text-blue-500" />;
    }
  };

  const getProgressValue = () => {
    switch (paymentStatus) {
      case 'pending':
        return 50;
      case 'success':
        return 100;
      case 'error':
        return 0;
      default:
        return 0;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span>Payment Required</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogTitle>
          <DialogDescription>
            Pay to use <strong>{tool}</strong> with x402 protocol
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment Status */}
          <div className="space-y-2">
            <Progress value={getProgressValue()} className="h-2" />
            <div className="flex justify-between text-sm text-gray-600">
              <span>Payment Status</span>
              <span className="capitalize">{paymentStatus}</span>
            </div>
          </div>

          {/* Payment Details */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Amount</span>
                  <div className="flex items-center space-x-1">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="font-bold">${amount.toFixed(4)} USDC</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Network</span>
                  <Badge variant="outline" className="text-xs">
                    Base Network
                  </Badge>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Tool</span>
                  <span className="text-sm">{tool}</span>
                </div>

                {/* Payment Address */}
                <div className="space-y-1">
                  <span className="text-sm font-medium">Payment Address</span>
                  <div className="flex items-center space-x-2 p-2 bg-gray-100 rounded">
                    <span className="text-xs font-mono flex-1 truncate">
                      {paymentRequirement.address}
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleCopyAddress}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Memo */}
                {paymentRequirement.memo && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium">Memo</span>
                    <div className="p-2 bg-gray-100 rounded text-xs font-mono">
                      {paymentRequirement.memo}
                    </div>
                  </div>
                )}

                {/* Expiration Timer */}
                {timeLeft > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span>Expires in</span>
                    <span className="font-mono text-orange-600">{formatTime(timeLeft)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Success/Error Messages */}
          {paymentStatus === 'success' && (
            <div className="bg-green-50 border border-green-200 p-3 rounded">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-green-800 font-medium">Payment Successful!</span>
              </div>
              {txHash && (
                <div className="mt-2 flex items-center space-x-2">
                  <span className="text-sm text-green-700">Transaction:</span>
                  <a
                    href={`https://basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center space-x-1"
                  >
                    <span className="font-mono truncate max-w-32">
                      {txHash}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {paymentStatus === 'error' && (
            <div className="bg-red-50 border border-red-200 p-3 rounded">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-800 font-medium">Payment Failed</span>
              </div>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          )}

          {/* Wallet Connection Status */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div className="flex items-center space-x-2">
              <Wallet className="h-4 w-4 text-gray-600" />
              <span className="text-sm">Wallet Status</span>
            </div>
            <Badge variant={walletConnected ? "default" : "secondary"}>
              {walletConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            {!walletConnected ? (
              <Button
                onClick={handleConnectWallet}
                className="flex-1"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            ) : (
              <Button
                onClick={handlePayment}
                disabled={paymentStatus === 'pending' || paymentStatus === 'success'}
                className="flex-1"
              >
                {paymentStatus === 'pending' ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : paymentStatus === 'success' ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Paid
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Send Payment
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </div>

          {/* Additional Info */}
          <div className="text-xs text-gray-500 text-center">
            Powered by x402 Protocol • Secure blockchain payments on Base
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default X402PaymentDialog;
