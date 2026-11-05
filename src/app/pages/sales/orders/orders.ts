/** A quotation or sales order line as the API returns it. */
export interface OrderLine {
  id: number;
  productId: number;
  productName: string;
  unitId: number;
  unitSymbol: string;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface Quotation {
  id: number;
  number: string;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  quoteDate: string;
  validUntil: string;
  subtotal: number;
  orderDiscount: number;
  discount: number;
  vat: number;
  total: number;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  salesOrderId: number | null;
  salesOrderNumber: string | null;
  note: string | null;
  lines: (OrderLine & { qty: number })[];
}

export interface SalesOrder {
  id: number;
  number: string;
  customerId: number;
  customerName: string;
  warehouseId: number;
  warehouseName: string;
  quotationId: number | null;
  quotationNumber: string | null;
  orderDate: string;
  deliveryDate: string | null;
  subtotal: number;
  orderDiscount: number;
  discount: number;
  vat: number;
  total: number;
  status: 'CONFIRMED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'CLOSED' | 'CANCELLED';
  note: string | null;
  lines: (OrderLine & { qtyOrdered: number; qtyDelivered: number })[];
  deliveries: { deliveryId: number; deliveryNumber: string; deliveredAt: string; invoiceId: number | null; invoiceNumber: string | null; invoiceTotal: number | null }[];
  /** Lines free stock does not cover yet: on hand less what other orders keep (FR-3.21). Base units. */
  shortages: { productId: number; productName: string; needed: number; free: number; unitSymbol: string }[];
}

export interface Delivered {
  order: SalesOrder;
  deliveryNumber: string;
  invoiceId: number;
  invoiceNumber: string;
  invoiceTotal: number;
  balanceDue: number;
}

/** What the form edits: a new quotation or order, or an existing one. */
export type OrderFormTarget =
  | { kind: 'quotation'; doc: Quotation | null }
  | { kind: 'order'; doc: SalesOrder | null };
