import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../core/api/api.service';
import { SubscriptionStatus } from '../../core/api/models';
import { NotifyService } from '../../core/notify.service';

interface BusinessRow {
  id: number;
  nameEn: string;
  nameKm: string | null;
  status: string;
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
}

/**
 * Platform admin (PLAIN.md M8), for super admins: every business with its plan and billing status, and the demo
 * controls that show a whole month of billing in two minutes (FR-8.7): End trial now, Run renewal now.
 */
@Component({
  selector: 'ms-admin-page',
  imports: [TranslatePipe, DatePipe, CurrencyPipe, TableModule, ButtonDirective, ButtonLabel],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.scss',
})
export class AdminPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

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
