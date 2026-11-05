import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';

import { ApiService } from '../../core/api/api.service';
import { SubscriptionStatus } from '../../core/api/models';
import { NotifyService } from '../../core/notify.service';
import { AdminAccounts } from '../admin-accounts/admin-accounts';
import { AdminMessages } from '../admin-messages/admin-messages';
import { AdminPlans } from '../admin-plans/admin-plans';
import { AdminSettings } from '../admin-settings/admin-settings';
import { AdminStats } from '../admin-stats/admin-stats';
import { AdminTransfers } from '../admin-transfers/admin-transfers';

interface BusinessRow {
  id: number;
  nameEn: string;
  nameKm: string | null;
  status: 'SETTING_UP' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: string;
  ownerEmail: string | null;
  members: number;
  branches: number;
  planCode: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  pastDueSince: string | null;
  cancelAtPeriodEnd: boolean;
  openInvoiceAmount: number | null;
  billingCycle: 'MONTHLY' | 'YEARLY' | null;
  /** Active add-ons, e.g. "Extra branch ×2". */
  addons: string | null;
}

type AdminTab = 'businesses' | 'stats' | 'accounts' | 'transfers' | 'plans' | 'messages' | 'settings';

/**
 * Platform admin (PLAIN.md M8, FR-8.1 to FR-8.7), for super admins: businesses with their plan (suspend, reactivate, and
 * the demo controls End trial now / Run renewal now), statistics (FR-8.9), accounts, bank transfers to approve, plans and
 * add-ons, the website's contact messages, and the platform settings with the announcement banner (FR-8.8, FR-8.10).
 */
@Component({
  selector: 'ms-admin-page',
  imports: [
    TranslatePipe, DatePipe, CurrencyPipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, ButtonDirective, ButtonLabel,
    AdminAccounts, AdminTransfers, AdminPlans, AdminMessages, AdminStats, AdminSettings,
  ],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.scss',
})
export class AdminPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly tab = signal<AdminTab>('businesses');
  protected readonly rows = signal<BusinessRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal<number | null>(null);

  constructor() {
    this.load();
  }

  protected endTrial(row: BusinessRow): void {
    this.control(row, 'end-trial', 'admin.endTrialAsk');
  }

  protected runRenewal(row: BusinessRow): void {
    this.control(row, 'run-renewal', row.subscriptionStatus === 'PAST_DUE' ? 'admin.expireAsk' : 'admin.renewAsk');
  }

  /** FR-8.2: a suspended business can't be opened by its members; nothing is deleted. */
  protected suspend(row: BusinessRow): void {
    this.control(row, row.status === 'SUSPENDED' ? 'reactivate' : 'suspend',
      row.status === 'SUSPENDED' ? 'admin.reactivateBusinessAsk' : 'admin.suspendBusinessAsk');
  }

  /** Demo control (FR-10.15): sends today's billing reminders now. */
  protected sendReminders(): void {
    this.api.post<number>('/admin/billing/reminders').subscribe({
      next: (n) => this.notify.showKey('admin.remindersSent', { n }),
      error: (e) => this.notify.error(e),
    });
  }

  private control(row: BusinessRow, action: string, ask: string): void {
    this.confirm.confirm({
      header: row.nameEn,
      message: this.translate.instant(ask, { name: row.nameEn }),
      acceptLabel: this.translate.instant('common.continue'),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: { text: true },
      accept: () => {
        this.busy.set(row.id);
        this.api.post(`/admin/businesses/${row.id}/${action}`).subscribe({
          next: () => {
            this.busy.set(null);
            this.notify.showKey('admin.done');
            this.load();
          },
          error: (e) => {
            this.busy.set(null);
            this.notify.error(e);
          },
        });
      },
    });
  }

  private load(): void {
    this.api.get<BusinessRow[]>('/admin/businesses').subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
  }
}
