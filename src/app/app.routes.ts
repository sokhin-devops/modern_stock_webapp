import { Routes } from '@angular/router';

import { authGuard, businessGuard, guestGuard, permissionGuard, setupGuard } from './core/auth/guards';
import { navPages } from './layout/nav';

/** Built screens; every other menu page opens "Coming next" until it is built. */
const BUILT = ['dashboard'];

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

  // Business area: the shell with the top bar and side menu
  {
    path: '',
    canActivate: [authGuard, businessGuard],
    loadComponent: () => import('./layout/app-shell/app-shell').then((m) => m.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard) },
      ...navPages()
        .filter((page) => !BUILT.includes(page.path))
        .map((page) => ({
          path: page.path,
          canActivate: [permissionGuard],
          data: { permissions: page.permissions, title: page.label },
          loadComponent: () => import('./pages/coming-soon/coming-soon').then((m) => m.ComingSoon),
        })),
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
