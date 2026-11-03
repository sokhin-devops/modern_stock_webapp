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
