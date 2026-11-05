import { environment } from '../../environments/environment';

/**
 * The website's Help Center guide for each page of the app (the guide slugs are in the website's
 * src/app/help/articles). The longest matching path wins; pages without a guide open the Help Center itself.
 */
const GUIDES: [path: string, slug: string][] = [
  ['dashboard', 'dashboard-and-alerts'],
  ['pos', 'pos-sale'],
  ['customers/transactions', 'orders-and-invoices'],
  ['customers/cash-shifts', 'cash-shift'],
  ['customers', 'customers'],
  ['suppliers/transactions', 'buy-and-receive'],
  ['suppliers/expenses', 'expenses'],
  ['suppliers', 'pay-suppliers'],
  ['inventory/stock-counts', 'stock-count'],
  ['inventory/transfers', 'transfers'],
  ['inventory/adjustments', 'adjustments'],
  ['inventory/stock', 'see-stock'],
  ['products/import', 'import-excel'],
  ['products', 'add-products'],
  ['reports', 'reports'],
  ['settings/members', 'invite-staff'],
  ['settings/activity', 'activity-log'],
  ['settings/billing', 'plans-and-billing'],
  ['settings/telegram', 'telegram'],
  ['settings', 'business-settings'],
  ['account', 'account-security'],
  ['businesses', 'several-businesses'],
  ['setup', 'set-up-business'],
];

/** The guide for an app URL such as "/inventory/transfers?status=SENT", in the given language. */
export function helpUrl(url: string, lang: string): string {
  const path = url.split(/[?#]/)[0].replace(/^\/+/, '');
  const guide = GUIDES.filter(([p]) => path === p || path.startsWith(p + '/')).sort((a, b) => b[0].length - a[0].length)[0];
  return `${environment.websiteUrl}/${lang}/help${guide ? '/' + guide[1] : ''}`;
}

/** The Help Center's front page. */
export function helpCenterUrl(lang: string): string {
  return `${environment.websiteUrl}/${lang}/help`;
}
