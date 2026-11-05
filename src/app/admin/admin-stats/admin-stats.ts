import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';
import { BarChart, BarPoint } from '../../shared/bar-chart/bar-chart';

interface WeekPoint {
  weekStart: string;
  accounts: number;
  businesses: number;
}

interface PlatformStats {
  accounts: number;
  verifiedAccounts: number;
  /** Created in the last 7 days. */
  newAccounts: number;
  businessesByStatus: Record<string, number>;
  /** Active businesses where someone signed in during the last 7 days. */
  businessesInUse: number;
  /** Not archived, by plan; TRIAL while on the trial. */
  businessesByPlan: Record<string, number>;
  monthlyRevenue: number;
  /** The last 12 weeks, oldest first. */
  weeks: WeekPoint[];
}

/**
 * Platform statistics (FR-8.9): sign-ups, businesses in use, by status and by plan, the monthly revenue, and sign-ups
 * per week for the last 12 weeks (accounts and businesses as two charts, not two scales on one).
 */
@Component({
  selector: 'ms-admin-stats',
  imports: [TranslatePipe, CurrencyPipe, DecimalPipe, BarChart],
  templateUrl: './admin-stats.html',
  styleUrls: ['../admin-tab.scss', './admin-stats.scss'],
})
export class AdminStats {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);

  protected readonly stats = signal<PlatformStats | null>(null);
  protected readonly statuses = ['ACTIVE', 'SETTING_UP', 'SUSPENDED', 'ARCHIVED'];
  protected readonly plans = computed(() => Object.entries(this.stats()?.businessesByPlan ?? {}).map(([plan, n]) => ({ plan, n })));
  protected readonly accountPoints = computed(() => this.points('accounts', 'admin.stats.accountsTip'));
  protected readonly businessPoints = computed(() => this.points('businesses', 'admin.stats.businessesTip'));
  protected readonly count = (value: number): string => String(Math.round(value));

  constructor() {
    this.api.get<PlatformStats>('/admin/stats').subscribe({
      next: (s) => this.stats.set(s),
      error: (e) => this.notify.error(e),
    });
  }

  private points(field: 'accounts' | 'businesses', tip: string): BarPoint[] {
    return (this.stats()?.weeks ?? []).map((w) => {
      const [, m, d] = w.weekStart.split('-');
      const week = `${d}/${m}`;
      return { key: w.weekStart, label: week, value: w[field], tip: this.translate.instant(tip, { n: w[field], week }) };
    });
  }
}
