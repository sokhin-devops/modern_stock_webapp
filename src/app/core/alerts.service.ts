import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Params } from '@angular/router';

import { ApiService } from './api/api.service';
import { BusinessService } from './business/business.service';

export type AlertKind =
  | 'PAYMENT_DUE' | 'EXPIRED' | 'OVERDUE_BILLS' | 'TRIAL_ENDING' | 'LOW_STOCK' | 'EXPIRING_1' | 'OVERDUE_INVOICES'
  | 'TRANSFERS_LATE' | 'APPROVALS' | 'TO_RECEIVE' | 'TRANSFER_REQUESTS' | 'COUNTS_OPEN' | 'COUNTS_TO_APPROVE' | 'RETURNS_TO_APPROVE'
  | 'PURCHASE_RETURNS_TO_APPROVE' | 'RENEWAL_SOON' | 'EXPIRING_2' | 'EXPIRING_3' | 'RATE_MISSING';

export interface Alert {
  kind: AlertKind;
  level: 'DANGER' | 'WARN' | 'INFO';
  count: number;
  /** EXPIRING_1..3: the window in days (FR-7.10); TRANSFERS_LATE: days in transit. */
  days?: number | null;
  /** Marked read by this member and nothing added since (POST /alerts/read). */
  read?: boolean;
}

/** A stored notification (GET /notifications): something that happened, for this member. */
export interface AppNotification {
  id: number;
  type: string;
  params: Record<string, unknown>;
  link: string | null;
  createdAt: string;
  read: boolean;
}

/** The icon of each notification type. */
export const NOTIFICATION_ICONS: Record<string, string> = {
  APPROVAL_ADJUSTMENT: 'pi pi-check-square',
  APPROVAL_STOCK_COUNT: 'pi pi-list-check',
  APPROVAL_SALES_RETURN: 'pi pi-replay',
  APPROVAL_PURCHASE_RETURN: 'pi pi-replay',
  TRANSFER_SENT: 'pi pi-truck',
  SHIFT_SHORT: 'pi pi-wallet',
  SALE_VOIDED: 'pi pi-ban',
  STOCK_OUT: 'pi pi-exclamation-circle',
};

/** Where each alert opens, and its icon. */
export const ALERT_TARGETS: Record<AlertKind, { icon: string; link: string; query?: Params; withDays?: true }> = {
  PAYMENT_DUE: { icon: 'pi pi-credit-card', link: '/settings/billing' },
  TRIAL_ENDING: { icon: 'pi pi-star', link: '/settings/billing' },
  RENEWAL_SOON: { icon: 'pi pi-calendar-clock', link: '/settings/billing' },
  EXPIRED: { icon: 'pi pi-ban', link: '/inventory/batches', query: { window: 'expired' } },
  OVERDUE_BILLS: { icon: 'pi pi-receipt', link: '/reports', query: { r: 'supplier-debt' } },
  LOW_STOCK: { icon: 'pi pi-arrow-down', link: '/reports', query: { r: 'reorder' } },
  EXPIRING_1: { icon: 'pi pi-calendar-times', link: '/inventory/batches', withDays: true },
  OVERDUE_INVOICES: { icon: 'pi pi-file', link: '/reports', query: { r: 'customer-debt' } },
  APPROVALS: { icon: 'pi pi-check-square', link: '/inventory/adjustments' },
  TRANSFERS_LATE: { icon: 'pi pi-clock', link: '/inventory/transfers', query: { status: 'IN_TRANSIT' } },
  TO_RECEIVE: { icon: 'pi pi-truck', link: '/inventory/transfers', query: { status: 'IN_TRANSIT' } },
  TRANSFER_REQUESTS: { icon: 'pi pi-inbox', link: '/inventory/transfers', query: { view: 'requests' } },
  COUNTS_OPEN: { icon: 'pi pi-list-check', link: '/inventory/stock-counts' },
  COUNTS_TO_APPROVE: { icon: 'pi pi-check-square', link: '/inventory/stock-counts' },
  RETURNS_TO_APPROVE: { icon: 'pi pi-replay', link: '/customers/transactions', query: { tab: 'returns' } },
  PURCHASE_RETURNS_TO_APPROVE: { icon: 'pi pi-replay', link: '/suppliers/transactions', query: { tab: 'returns' } },
  EXPIRING_2: { icon: 'pi pi-calendar', link: '/inventory/batches', withDays: true },
  EXPIRING_3: { icon: 'pi pi-calendar', link: '/inventory/batches', withDays: true },
  RATE_MISSING: { icon: 'pi pi-money-bill', link: '/settings/rates' },
};

/** Where an alert opens: the near-expiry ones open the report on their own window. */
export function alertQuery(a: Alert): Params | undefined {
  const target = ALERT_TARGETS[a.kind];
  return target.withDays && a.days ? { ...target.query, window: a.days } : target.query;
}

/** Reload every 5 minutes while the app is open, so new alerts show up without a refresh. */
const EVERY_MS = 5 * 60_000;

/**
 * In-app alerts (FR-5.1, FR-5.6) for the bell in the top bar: what needs attention for the member's role in the
 * selected branch (GET /alerts), plus today's missing exchange rate for whoever sets it. Follows the business and
 * branch, and reloads now and then.
 */
@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);

  private readonly fromApi = signal<Alert[]>([]);
  /** Stored notifications (PLAIN.md 10.2), newest first, and how many are unread. */
  readonly notifications = signal<AppNotification[]>([]);
  private readonly unreadNotifications = signal(0);

  readonly alerts = computed<Alert[]>(() => {
    const list = [...this.fromApi()];
    if (this.business.rate()?.stale && this.business.can('exchange_rate:manage')) {
      list.unshift({ kind: 'RATE_MISSING', level: 'WARN', count: 1 });
    }
    return list;
  });
  /** The badge: alerts not marked read, plus notifications not read yet. */
  readonly total = computed(() => this.alerts().reduce((sum, a) => sum + (a.read ? 0 : a.count), 0) + this.unreadNotifications());
  readonly anyUnread = computed(() => this.alerts().some((a) => !a.read && a.kind !== 'RATE_MISSING') || this.unreadNotifications() > 0);

  constructor() {
    effect(() => {
      const business = this.business.businessId();
      this.business.branchId();
      untracked(() => {
        if (business) {
          this.refresh();
        } else {
          this.fromApi.set([]);
          this.notifications.set([]);
          this.unreadNotifications.set(0);
        }
      });
    });
    setInterval(() => this.business.businessId() && this.refresh(), EVERY_MS);
  }

  /** One notification read (when it is opened). */
  readNotification(n: AppNotification): void {
    if (n.read) {
      return;
    }
    this.api.post<{ unread: number; items: AppNotification[] }>(`/notifications/${n.id}/read`).subscribe({
      next: (r) => this.setNotifications(r),
      error: () => undefined,
    });
  }

  /** Every alert and every notification read now ("Mark all read"). */
  markAllRead(): void {
    this.markRead();
    this.api.post<{ unread: number; items: AppNotification[] }>('/notifications/read').subscribe({
      next: (r) => this.setNotifications(r),
      error: () => undefined,
    });
  }

  private setNotifications(r: { unread: number; items: AppNotification[] }): void {
    this.notifications.set(r.items);
    this.unreadNotifications.set(r.unread);
  }

  /** One kind, or every alert shown (no kind), read at its count now; it is unread again when the count grows. */
  markRead(kind?: AlertKind): void {
    if (kind === 'RATE_MISSING') {
      return; // not from the API: it goes once today's rate is set
    }
    this.api.post<{ total: number; alerts: Alert[] }>(`/alerts/read${kind ? '?kind=' + kind : ''}`).subscribe({
      next: (r) => this.fromApi.set(r.alerts),
      error: () => undefined,
    });
  }

  refresh(): void {
    this.api.get<{ total: number; alerts: Alert[] }>('/alerts').subscribe({
      next: (r) => this.fromApi.set(r.alerts),
      error: () => undefined, // alerts are a convenience: a failed reload keeps the last ones
    });
    this.api.get<{ unread: number; items: AppNotification[] }>('/notifications?size=15').subscribe({
      next: (r) => this.setNotifications(r),
      error: () => undefined,
    });
  }
}
