/**
 * The side menu (PLAIN.md 12.2), in the prototype's order. Each page names the permission(s) it needs: the menu shows
 * only what the member's role allows (the API checks again on every request). Pages not built yet open "Coming next".
 */
export interface NavPage {
  path: string;
  label: string;
  /** Any one of these is enough; none = everyone. */
  permissions?: string[];
}

export interface NavItem extends Partial<NavPage> {
  id: string;
  /** PrimeIcons classes, for example "pi pi-box". */
  icon: string;
  label: string;
  children?: NavPage[];
  divider?: boolean;
}

export const NAV: NavItem[] = [
  { id: 'dashboard', icon: 'pi pi-objects-column', label: 'nav.dashboard', path: 'dashboard' },
  { id: 'pos', icon: 'pi pi-shopping-cart', label: 'nav.pos', path: 'pos', permissions: ['sale:create'], divider: true },
  {
    id: 'customers', icon: 'pi pi-users', label: 'nav.customerMenu', children: [
      { path: 'customers', label: 'nav.customers', permissions: ['customer:view', 'customer:create_pos'] },
      { path: 'customers/transactions', label: 'nav.customerTransactions', permissions: ['sale:create', 'customer:view', 'sales_order:view', 'delivery:manage'] },
      { path: 'customers/cash-shifts', label: 'nav.shifts', permissions: ['cash_shift:own', 'cash_shift:all'] },
    ],
  },
  {
    id: 'suppliers', icon: 'pi pi-truck', label: 'nav.supplierMenu', children: [
      { path: 'suppliers', label: 'nav.suppliers', permissions: ['supplier:view'] },
      { path: 'suppliers/transactions', label: 'nav.supplierTransactions', permissions: ['purchase_order:view', 'bill:manage'] },
      { path: 'suppliers/expenses', label: 'nav.expenses', permissions: ['expense:manage'] },
    ],
  },
  {
    id: 'inventory', icon: 'pi pi-box', label: 'nav.inventory', children: [
      { path: 'inventory/stock', label: 'nav.stock', permissions: ['stock:view'] },
      { path: 'inventory/adjustments', label: 'nav.adjustments', permissions: ['stock:view'] },
      { path: 'inventory/transfers', label: 'nav.transfers', permissions: ['stock:view'] },
      { path: 'inventory/stock-counts', label: 'nav.stockCounts', permissions: ['count:manage'] },
    ],
  },
  {
    id: 'products', icon: 'pi pi-tags', label: 'nav.catalog', children: [
      { path: 'products', label: 'nav.products', permissions: ['product:view'] },
      { path: 'products/import', label: 'nav.import', permissions: ['product:manage'] },
    ],
  },
  { id: 'reports', icon: 'pi pi-chart-bar', label: 'nav.reports', path: 'reports', permissions: ['report:view'] },
  {
    id: 'settings', icon: 'pi pi-cog', label: 'nav.settings', children: [
      { path: 'settings/profile', label: 'nav.profile', permissions: ['business:manage'] },
      { path: 'settings/branches', label: 'nav.branches', permissions: ['business:manage'] },
      { path: 'settings/members', label: 'nav.members', permissions: ['member:view'] },
      { path: 'settings/activity', label: 'nav.activity', permissions: ['activity:view'] },
      { path: 'settings/rates', label: 'nav.rates', permissions: ['exchange_rate:manage'] },
      { path: 'settings/tax', label: 'nav.tax', permissions: ['business:manage'] },
      { path: 'settings/sales-rules', label: 'nav.salesRules', permissions: ['business:manage'] },
      { path: 'settings/expense-categories', label: 'nav.expenseCategories', permissions: ['expense:manage'] },
      { path: 'settings/telegram', label: 'nav.telegram', permissions: ['business:manage'] },
      { path: 'settings/appearance', label: 'nav.appearance' },
      { path: 'settings/billing', label: 'nav.billing', permissions: ['billing:manage'] },
    ],
  },
];

/** Every page of the menu, for the routes. */
export function navPages(): NavPage[] {
  return NAV.flatMap((item) => (item.children ?? (item.path ? [item as NavPage] : [])));
}
