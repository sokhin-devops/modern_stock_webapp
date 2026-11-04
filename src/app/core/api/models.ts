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
  /** Above the plan's branch limit after a plan ended: viewable, no new work. */
  readOnly: boolean;
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

/** One branch's stock of a product in the stock by branch view (FR-4.7, FR-4.8). */
export interface BranchQty {
  branchId: number;
  qtyOnHand: number;
  /** The branch's own reorder level, or the product's; 0 = not watched there. */
  reorderLevel: number;
  low: boolean;
}

/** GET /stock/by-branch: a product's stock in every branch the member may use, main branch first. */
export interface BranchStockRow {
  productId: number;
  sku: string;
  nameEn: string;
  nameKm: string | null;
  unitSymbol: string;
  qtyOnHand: number;
  branches: BranchQty[];
}

/** Plan and billing for Owners (GET /billing, PLAIN.md 11.13). */
export interface Billing {
  planCode: string;
  planName: string;
  /** Where the limits come from: PRO during the trial, FREE after a plan ends. */
  effectivePlanCode: string;
  status: SubscriptionStatus;
  billingCycle: 'MONTHLY' | 'YEARLY';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { key: string; limit: number | null; used: number }[];
  /** A paid plan is chosen (in the trial: billed when it ends). */
  subscribed: boolean;
  /** The plan that starts at the end of the period (a downgrade). */
  pendingPlanCode: string | null;
  /** Past due: pay before this, or the plan expires to Free. */
  pastDueUntil: string | null;
  /** The demo payment buttons are on. */
  demo: boolean;
  openInvoice: BillingInvoice | null;
  plans: PlanView[];
}

export interface PlanView {
  code: string;
  name: string;
  priceMonthly: number;
  /** null = unlimited; features are 0 or 1. */
  limits: Record<string, number | null>;
}

/** The platform's invoice to the business (SUB-…). */
export interface BillingInvoice {
  id: number;
  number: string;
  kind: 'NEW' | 'RENEWAL' | 'UPGRADE';
  planCode: string;
  planName: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: 'OPEN' | 'PAID' | 'VOID';
  createdAt: string;
  paidAt: string | null;
}

export interface BillingPayment {
  id: number;
  invoiceId: number;
  gateway: string;
  reference: string;
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  failureReason: string | null;
}

/** Dashboard numbers by role (GET /dashboard, PLAIN.md 12.3); a part the member's role does not see is null. */
export interface DashboardData {
  /** A cashier: the sales numbers are their own. */
  ownSalesOnly: boolean;
  today: { usd: number; khr: number; receipts: number } | null;
  profitToday: number | null;
  profitMonth: number | null;
  /** The last 30 days, oldest first; profit only for Owners and Managers. */
  days: { day: string; sales: number; profit: number | null }[] | null;
  topProducts: { productId: number; name: string; nameKm: string | null; qty: number; unitSymbol: string; sales: number }[] | null;
  debts: {
    customersOwe: number;
    customersOverdue: number;
    overdueInvoices: number;
    weOwe: number;
    billsDueSoon: number;
    overdueBills: number;
  } | null;
  waiting: {
    approvals: number | null;
    transfersToReceive: number | null;
    countsInProgress: number | null;
    countsToApprove: number | null;
  } | null;
}

/** The biggest packaging unit of a product, to show stock as boxes and pieces. */
export interface Pack {
  symbol: string;
  factor: number;
}

export type SalesBy = 'DAY' | 'PRODUCT' | 'CATEGORY' | 'BRANCH' | 'CASHIER';

/** Reports (PLAIN.md 14). Cost, profit and values are null for roles that do not see them. */
export interface SalesReport {
  from: string;
  to: string;
  by: SalesBy;
  ownSalesOnly: boolean;
  documents: number;
  sales: number;
  cost: number | null;
  grossProfit: number | null;
  margin: number | null;
  vat: number;
  rows: {
    key: string;
    label: string | null;
    labelKm: string | null;
    qty: number | null;
    unitSymbol: string | null;
    documents: number;
    sales: number;
    cost: number | null;
    profit: number | null;
    margin: number | null;
  }[];
}

export interface ProfitReport {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  expensesByCategory: { category: string; amount: number }[];
}

export interface CustomerDebtReport {
  total: number;
  overdue: number;
  overdueInvoices: number;
  rows: { id: number; name: string; phone: string | null; balance: number; overdue: number; openInvoices: number; oldestDue: string | null }[];
}

export interface SupplierDebtReport {
  total: number;
  dueSoon: number;
  overdue: number;
  overdueBills: number;
  rows: {
    id: number;
    name: string;
    phone: string | null;
    balance: number;
    dueSoon: number;
    overdue: number;
    openBills: number;
    nextDue: string | null;
  }[];
}

/** Should reports (PLAIN.md 14). Values are null for roles that do not see cost. */
export interface LossReport {
  from: string;
  to: string;
  value: number | null;
  reasons: { reason: string; products: number; value: number | null }[];
  rows: { reason: string; productId: number; name: string; nameKm: string | null; unitSymbol: string; qty: number; value: number | null }[];
}

export interface SlowReport {
  days: number;
  products: number;
  value: number | null;
  rows: {
    productId: number;
    sku: string;
    name: string;
    nameKm: string | null;
    category: string | null;
    unitSymbol: string;
    pack: Pack | null;
    qty: number;
    value: number | null;
    lastSold: string | null;
  }[];
}

export interface ShiftReport {
  shifts: number;
  shortShifts: number;
  shortUsd: number;
  overUsd: number;
  shortKhr: number;
  overKhr: number;
  voids: number;
  rows: {
    id: number;
    branch: string;
    cashier: string;
    openedAt: string;
    closedAt: string;
    expectedUsd: number;
    countedUsd: number | null;
    differenceUsd: number | null;
    expectedKhr: number;
    countedKhr: number | null;
    differenceKhr: number | null;
    voids: number;
    voidedValue: number;
  }[];
}

export interface VatReport {
  salesVat: number;
  purchaseVat: number;
  payable: number;
  rows: { month: string; taxableSales: number; salesVat: number; purchases: number; purchaseVat: number; payable: number }[];
}

export type PurchasesBy = 'SUPPLIER' | 'PRODUCT';

export interface PurchaseReport {
  by: PurchasesBy;
  receipts: number;
  spend: number;
  returned: number;
  rows: {
    key: string;
    label: string;
    labelKm: string | null;
    qty: number | null;
    unitSymbol: string | null;
    spend: number;
    returned: number;
    avgCost: number | null;
    receipts: number;
  }[];
}

export interface Statement {
  party: 'CUSTOMER' | 'SUPPLIER';
  partyId: number;
  name: string;
  phone: string | null;
  from: string;
  to: string;
  opening: number;
  debits: number;
  credits: number;
  closing: number;
  lines: { date: string; type: string; number: string; debit: number; credit: number; balance: number }[];
}

export interface AbcReport {
  total: number;
  groups: { group: 'A' | 'B' | 'C'; products: number; value: number; share: number }[];
  rows: {
    productId: number;
    sku: string;
    name: string;
    nameKm: string | null;
    qty: number;
    unitSymbol: string;
    value: number;
    share: number;
    cumulative: number;
    group: 'A' | 'B' | 'C';
  }[];
}

export interface OnHandReport {
  value: number | null;
  products: number;
  inTransitValue: number | null;
  transfersInTransit: number;
  rows: {
    productId: number;
    sku: string;
    name: string;
    nameKm: string | null;
    category: string | null;
    unitSymbol: string;
    pack: Pack | null;
    qty: number;
    avgCost: number | null;
    value: number | null;
  }[];
}

export interface ReorderReport {
  coverDays: number;
  salesDays: number;
  suggestedValue: number | null;
  rows: {
    productId: number;
    sku: string;
    name: string;
    nameKm: string | null;
    unitSymbol: string;
    pack: Pack | null;
    onHand: number;
    reorderLevel: number;
    soldPerDay: number;
    leadTimeDays: number;
    suggestedQty: number;
    lastCost: number | null;
    suggestedValue: number | null;
  }[];
}

export interface ExpiryReport {
  days: 30 | 60 | 90;
  expired: number;
  expiring: number;
  expiredValue: number | null;
  expiringValue: number | null;
  rows: {
    batchId: number;
    productId: number;
    name: string;
    nameKm: string | null;
    unitSymbol: string;
    warehouse: string;
    batchNo: string | null;
    expiryDate: string;
    daysLeft: number;
    qty: number;
    value: number | null;
  }[];
}

export interface CountReport {
  counts: number;
  gainValue: number | null;
  lossValue: number | null;
  rows: {
    countId: number;
    number: string;
    postedOn: string;
    warehouse: string;
    productId: number;
    name: string;
    nameKm: string | null;
    unitSymbol: string;
    systemQty: number;
    countedQty: number;
    difference: number;
    value: number | null;
  }[];
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
  /** The photo's path under the API (see the apiFile pipe), or null. */
  photoUrl: string | null;
  /** Reorder level of the branches you are looking at: each branch's own level, or reorderLevel, added up (FR-4.7). */
  reorderAt: number;
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
  /** Under the shop's name on receipts. */
  receiptHeader: string | null;
  /** Receipt paper width in mm. */
  receiptPaper: 58 | 80;
  receiptShowVatTin: boolean;
  /** Customers may pay by KHQR or bank (cash is always on). */
  khqrEnabled: boolean;
  bankEnabled: boolean;
  /** The shop's KHQR image under the API, shown at the POS. Read only. */
  khqrImageUrl: string | null;
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
  /** The logo's path under the API (see the apiFile pipe), or null. */
  logoUrl: string | null;
}
