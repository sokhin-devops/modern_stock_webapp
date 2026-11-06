/** A customer's credit note (FR-3.12) or a supplier credit (FR-2.8): money owed back, used on documents or refunded. */
export type CreditKind = 'customer' | 'supplier';

export interface Credit {
  id: number;
  number: string;
  customerId?: number | null;
  customerName?: string | null;
  supplierId?: number;
  supplierName?: string;
  issuedAt: string;
  amount: number;
  usedAmount: number;
  refundedAmount: number;
  left: number;
  status: 'OPEN' | 'CLOSED' | 'VOID';
  reason: string | null;
  /** Made by a return: voided with the return, not on its own. */
  salesReturnId?: number | null;
  purchaseReturnId?: number | null;
}

/** What differs between the two kinds: where they live, what they pay, and who may change them. */
export const CREDIT_KINDS = {
  customer: { path: '/credit-notes', parties: '/customers', docs: '/invoices', partyField: 'customerId', docField: 'invoiceId', permission: 'sale:void' },
  supplier: { path: '/supplier-credits', parties: '/suppliers', docs: '/bills', partyField: 'supplierId', docField: 'billId', permission: 'bill:manage' },
} as const;

export function creditParty(c: Credit): { id: number | null; name: string | null } {
  return c.supplierId != null
    ? { id: c.supplierId, name: c.supplierName ?? null }
    : { id: c.customerId ?? null, name: c.customerName ?? null };
}
