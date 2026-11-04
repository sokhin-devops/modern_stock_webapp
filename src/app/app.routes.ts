import { Type } from '@angular/core';
import { Routes } from '@angular/router';

import { authGuard, businessGuard, guestGuard, permissionGuard, setupGuard } from './core/auth/guards';
import { navPages } from './layout/nav';

/** The screen of each menu page (a page missing here would open "Coming next"). */
const BUILT: Record<string, () => Promise<Type<unknown>>> = {
  products: () => import('./pages/products/products-page/products-page').then((m) => m.ProductsPage),
  'inventory/stock': () => import('./pages/stock/stock-page/stock-page').then((m) => m.StockPage),
  customers: () => import('./pages/partners/partners-page/partners-page').then((m) => m.PartnersPage),
  suppliers: () => import('./pages/partners/partners-page/partners-page').then((m) => m.PartnersPage),
  'settings/profile': () => import('./pages/settings/profile-page/profile-page').then((m) => m.ProfilePage),
  'settings/branches': () => import('./pages/settings/branches-page/branches-page').then((m) => m.BranchesPage),
  'settings/members': () => import('./pages/settings/members-page/members-page').then((m) => m.MembersPage),
  'settings/rates': () => import('./pages/settings/rates-page/rates-page').then((m) => m.RatesPage),
  'settings/tax': () => import('./pages/settings/rules-page/rules-page').then((m) => m.RulesPage),
  'settings/sales-rules': () => import('./pages/settings/rules-page/rules-page').then((m) => m.RulesPage),
  'settings/appearance': () => import('./pages/settings/appearance-page/appearance-page').then((m) => m.AppearancePage),
  'settings/billing': () => import('./pages/settings/billing-page/billing-page').then((m) => m.BillingPage),
  'inventory/adjustments': () => import('./pages/adjustments/adjustments-page/adjustments-page').then((m) => m.AdjustmentsPage),
  'inventory/transfers': () => import('./pages/transfers/transfers-page/transfers-page').then((m) => m.TransfersPage),
  'suppliers/transactions': () => import('./pages/purchases/purchases-page/purchases-page').then((m) => m.PurchasesPage),
  'customers/transactions': () => import('./pages/sales/sales-page/sales-page').then((m) => m.SalesPage),
  'customers/cash-shifts': () => import('./pages/sales/shifts-page/shifts-page').then((m) => m.ShiftsPage),
  'suppliers/expenses': () => import('./pages/expenses/expenses-page/expenses-page').then((m) => m.ExpensesPage),
  'settings/expense-categories': () =>
    import('./pages/expenses/expense-categories-page/expense-categories-page').then((m) => m.ExpenseCategoriesPage),
  'settings/telegram': () => import('./pages/settings/telegram-page/telegram-page').then((m) => m.TelegramPage),
  'inventory/stock-counts': () => import('./pages/counts/counts-page/counts-page').then((m) => m.CountsPage),
  'products/import': () => import('./pages/products/import-page/import-page').then((m) => m.ImportPage),
  reports: () => import('./pages/reports/reports-page/reports-page').then((m) => m.ReportsPage),
};

export const routes: Routes = [
  // Account area without a login (PLAIN.md 8 route table)
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./auth/login/login').then((m) => m.Login) },
  { path: 'sign-up', canActivate: [guestGuard], loadComponent: () => import('./auth/sign-up/sign-up').then((m) => m.SignUp) },
  { path: 'verify-email', loadComponent: () => import('./auth/verify-email/verify-email').then((m) => m.VerifyEmail) },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  { path: 'invite/:token', loadComponent: () => import('./auth/invite/invite').then((m) => m.Invite) },

  // Account area after login: my businesses and the setup page
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/account-shell/account-shell').then((m) => m.AccountShell),
    children: [
      { path: 'businesses', loadComponent: () => import('./account/businesses/businesses').then((m) => m.Businesses) },
      {
        path: 'setup',
        canActivate: [setupGuard],
        loadComponent: () => import('./account/setup/setup').then((m) => m.Setup),
      },
    ],
  },

  // The POS fills the screen on its own, without the side menu (prototype pos.html). The permission is checked on
  // the child route, after businessGuard has loaded the business and its permissions.
  {
    path: 'pos',
    canActivate: [authGuard, businessGuard],
    children: [
      {
        path: '',
        canActivate: [permissionGuard],
        data: { permissions: ['sale:create'] },
        loadComponent: () => import('./pages/pos/pos-page/pos-page').then((m) => m.PosPage),
      },
    ],
  },

  // Business area: the shell with the top bar and side menu
  {
    path: '',
    canActivate: [authGuard, businessGuard],
    loadComponent: () => import('./layout/app-shell/app-shell').then((m) => m.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard) },
      ...navPages()
        .filter((page) => page.path !== 'dashboard' && page.path !== 'pos')
        .map((page) => ({
          path: page.path,
          canActivate: [permissionGuard],
          data: { permissions: page.permissions, title: page.label },
          loadComponent: BUILT[page.path] ?? (() => import('./pages/coming-soon/coming-soon').then((m) => m.ComingSoon)),
        })),
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
