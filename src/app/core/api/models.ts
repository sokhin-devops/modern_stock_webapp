// Types of the API responses used by the web app, matching modern_stock_api/docs/openapi.yaml.
// Money is a number in USD (2 decimals); riel amounts are whole numbers; dates are ISO strings.

export type Lang = 'km' | 'en';

/** Every API error: RFC 7807 ProblemDetail with a code and a message in the request's language. */
export interface ProblemDetail {
  title: string;
  status: number;
  detail: string;
  code: string;
  errors?: Record<string, string>;
}

export interface UserResponse {
  id: number;
  fullName: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  locale: Lang;
  uiMode: 'light' | 'dark' | 'system';
  uiDensity: 'comfortable' | 'compact';
  emailVerified: boolean;
  superAdmin: boolean;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserResponse;
  /** Only after joining through an invitation: the business to open. */
  businessId?: number;
}

/** devLink is only filled by the API in development, so flows can be tested without email. */
export interface MessageResponse {
  message: string;
  devLink?: string;
}

export type BusinessStatus = 'SETTING_UP' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED';

export interface MyBusiness {
  id: number;
  nameEn: string;
  nameKm: string | null;
  businessType: string;
  status: BusinessStatus;
  onboardingCompleted: boolean;
  roleCode: string;
  roleNameEn: string;
  roleNameKm: string | null;
  /** null = all branches. */
  branchId: number | null;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: string | null;
  permissions: string[];
}

export interface MyInvitation {
  id: number;
  businessId: number;
  businessName: string;
  roleNameEn: string;
  roleNameKm: string | null;
  branchName: string | null;
  expiresAt: string;
}

export interface InvitationDetails {
  businessName: string;
  businessNameKm: string | null;
  roleNameEn: string;
  roleNameKm: string | null;
  branchName: string | null;
  email: string | null;
  expiresAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
}

export interface Warehouse {
  id: number;
  branchId: number;
  nameEn: string;
  nameKm: string | null;
  sales: boolean;
  receiving: boolean;
  active: boolean;
}

export interface Branch {
  id: number;
  code: string;
  nameEn: string;
  nameKm: string | null;
  address: string | null;
  phone: string | null;
  province: string | null;
  main: boolean;
  active: boolean;
  warehouses: Warehouse[];
}

export interface Rate {
  usdToKhr: number;
  rateDate: string;
  /** Today's rate is missing, so the last one is used. */
  stale: boolean;
}

export interface StockSummary {
  onHandValue: number;
  /** null when one branch is selected. */
  inTransitValue: number | null;
  lowStockItems: number;
  expiringIn30Days: number;
  expiredBatches: number;
}

export interface StockRow {
  productId: number;
  sku: string;
  nameEn: string;
  nameKm: string | null;
  unitSymbol: string;
  qtyOnHand: number;
  reorderLevel: number;
  value: number | null;
  low: boolean;
}

export interface Billing {
  planCode: string;
  planName: string;
  effectivePlanCode: string;
  status: SubscriptionStatus;
  billingCycle: 'MONTHLY' | 'YEARLY';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { key: string; limit: number | null; used: number }[];
}

/** Lists from the API (PLAIN.md 13): one page of rows and the paging numbers. */
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Category {
  id: number;
  parentId: number | null;
  nameEn: string;
  nameKm: string | null;
}

export interface Unit {
  id: number;
  nameEn: string;
  nameKm: string | null;
  symbol: string;
}

/** A bigger unit of a product, for example a box of 24 pieces. */
export interface ProductUnit {
  unitId: number;
  unitSymbol?: string;
  /** Base units in one of this unit. */
  factor: number;
  barcode: string | null;
  /** Empty = base price × factor. */
  sellPrice: number | null;
}

export interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  nameEn: string;
  nameKm: string | null;
  categoryId: number | null;
  baseUnitId: number;
  baseUnitSymbol: string;
  sellPrice: number;
  /** Only for members who manage products. */
  avgCost: number | null;
  reorderLevel: number;
  leadTimeDays: number;
  trackExpiry: boolean;
  vatExempt: boolean;
  active: boolean;
  units: ProductUnit[];
  /** Base units on hand in the branches you are looking at. */
  qtyOnHand: number;
}

export interface ProductRequest {
  sku: string | null;
  barcode: string | null;
  nameEn: string;
  nameKm: string | null;
  categoryId: number | null;
  baseUnitId: number;
  sellPrice: number;
  reorderLevel: number | null;
  leadTimeDays: number | null;
  trackExpiry: boolean;
  vatExempt: boolean;
  units: ProductUnit[];
}

export interface BatchRow {
  id: number;
  productId: number;
  productName: string;
  warehouseId: number;
  warehouseName: string;
  batchNo: string | null;
  expiryDate: string | null;
  qtyOnHand: number;
  expired: boolean;
}

export interface WarehouseStock {
  warehouseId: number;
  warehouseName: string;
  qtyOnHand: number;
  batches: BatchRow[];
}

/** One product: stock per warehouse and batch. */
export interface ProductStock {
  productId: number;
  nameEn: string;
  qtyOnHand: number;
  warehouses: WarehouseStock[];
}

/** One line of the stock card. */
export interface MovementRow {
  id: number;
  at: string;
  productId: number;
  productName: string;
  warehouseId: number;
  warehouseName: string;
  batchId: number | null;
  type: string;
  qty: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: number | null;
}

export interface BusinessSettings {
  vatEnabled: boolean;
  vatRate: number;
  /** Riel amounts round to 100, 500 or 1,000. */
  rielRounding: number;
  maxDiscountPercent: number;
  allowNegativeStock: boolean;
  receiptFooter: string | null;
}

/** A scanned barcode: the product, the unit the barcode belongs to, and its price in this branch. */
export interface BarcodeLookup {
  product: Product;
  unitId: number | null;
  factor: number;
  price: number;
  qtyOnHand: number;
}

export type PaymentMethod = 'CASH' | 'KHQR' | 'BANK';
export type Currency = 'USD' | 'KHR';

export interface PaymentLine {
  method: PaymentMethod;
  currency: Currency;
  /** USD with cents or whole riel. */
  amount: number;
  reference?: string | null;
}

export interface CheckoutRequest {
  branchId: number | null;
  customerId: number | null;
  items: { productId: number; unitId: number | null; qty: number; discount?: number | null }[];
  discount?: number | null;
  payments: PaymentLine[];
  note?: string | null;
}

export interface SaleLine {
  productId: number;
  productName: string;
  unitId: number | null;
  unitSymbol: string;
  qty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface CheckoutResponse {
  /** SALES_RECEIPT (paid in full) or INVOICE (pay later). */
  documentType: 'SALES_RECEIPT' | 'INVOICE';
  id: number;
  number: string;
  customerId: number | null;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  totalKhr: number;
  exchangeRate: number;
  tenderedKhr: number;
  changeKhr: number;
  balanceDue: number;
  lines: SaleLine[];
  payments: { method: PaymentMethod; currency: Currency; amount: number }[];
  warnings: string[];
}

export interface CashShift {
  id: number;
  branchId: number;
  cashierId: number;
  cashierName: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingUsd: number;
  openingKhr: number;
  expectedUsd: number;
  expectedKhr: number;
  countedUsd: number | null;
  countedKhr: number | null;
  /** counted − expected: + over, − short. */
  differenceUsd: number | null;
  differenceKhr: number | null;
  receipts: number;
}

export interface Customer {
  id: number;
  name: string;
  type: string;
  phone: string | null;
  address: string | null;
  vatTin: string | null;
  creditLimit: number | null;
  paymentTermsDays: number;
  openingBalance: number | null;
  openingBalanceDate: string | null;
  active: boolean;
  /** What the customer owes now, USD (negative = deposit). */
  balance: number;
}

export interface Supplier {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  telegram: string | null;
  address: string | null;
  vatTin: string | null;
  paymentTermsDays: number;
  openingBalance: number | null;
  openingBalanceDate: string | null;
  active: boolean;
  /** What we owe the supplier now, USD (negative = advance paid). */
  balance: number;
}

/** The open business's profile (Settings: Business profile). */
export interface BusinessProfile {
  id: number;
  nameEn: string;
  nameKm: string | null;
  businessType: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  province: string | null;
  vatTin: string | null;
  /** Palette name: blue, indigo, purple, teal or green. */
  themeColor: string | null;
  language: string;
}
