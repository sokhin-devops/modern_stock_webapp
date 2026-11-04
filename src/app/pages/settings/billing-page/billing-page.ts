import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ProgressBar } from 'primeng/progressbar';

import { ApiService } from '../../../core/api/api.service';
import { Billing } from '../../../core/api/models';
import { NotifyService } from '../../../core/notify.service';

interface PlanRow {
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  limits: Record<string, number | null>;
}

/**
 * Plan and billing (prototype billing.html, PLAIN.md 11.13): the plan, its status and renewal, how much of each limit
 * is used, and the plans side by side. Changing plan online is not built yet (the API has no payment endpoint).
 */
@Component({
  selector: 'ms-billing-page',
  imports: [TranslatePipe, DatePipe, ProgressBar],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss',
})
export class BillingPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly billing = signal<Billing | null>(null);
  protected readonly plans = signal<PlanRow[]>([]);

  constructor() {
    this.api.get<Billing>('/billing').subscribe({ next: (b) => this.billing.set(b), error: (e) => this.notify.error(e) });
    this.api.get<PlanRow[]>('/public/plans').subscribe({ next: (p) => this.plans.set(p) });
  }

  protected percent(used: number, limit: number | null): number {
    return limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }
}
