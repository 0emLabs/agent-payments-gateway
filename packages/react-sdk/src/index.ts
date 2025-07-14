/**
 * React Payments Gateway SDK
 * 
 * Exports:
 *  - useX402Payment(): hook for managing x402 payment flow
 *  - X402PaymentDialog: ready-made dialog component
 */

export { useX402Payment } from './hooks/useX402Payment';
export type { UseX402PaymentReturn } from './hooks/useX402Payment';
export {
  default as X402PaymentDialog,
  X402PaymentDialog as PaymentDialog,
} from './components/X402PaymentDialog';