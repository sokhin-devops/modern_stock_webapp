import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { ProgressBar } from 'primeng/progressbar';
import { SelectButton } from 'primeng/selectbutton';

import { environment } from '../../../environments/environment';
import { DashboardData, StockRow, StockSummary } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { BillingService } from '../../core/billing.service';
import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { BarChart, BarPoint } from '../../shared/bar-chart/bar-chart';

const API = environment.apiUrl;
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD_SHORT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' });

/**
 * Dashboard by role (PLAIN.md 12.3): today's sales (a cashier's own), profit, stock value, low stock and expiry,
 * debts, the sales chart and best sellers, what waits for the member, and the plan for the Owner. The API leaves out
 * what a role does not see. Everything follows the business and the branch in the top bar; counts open their report.
 */
@Component({
  selector: 'ms-dashboard',
  imports: [
    FormsModule, RouterLink, TranslatePipe, CurrencyPipe, DecimalPipe, DatePipe, ButtonDirective, ButtonIcon, ButtonLabel,
    ProgressBar, SelectButton, BarChart,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  /** Reload key: the open business and the selected branch. */
  private readonly scope = computed(() => ({ business: this.business.businessId(), branch: this.business.branchId() }));

  protected readonly data = rxResource({
    request: () => this.scope(),
    loader: () => this.http.get<DashboardData>(`${API}/dashboard`),
  });

  protected readonly summary = rxResource({
    request: () => (this.business.can('stock:view') ? this.scope() : undefined),
    loader: () => this.http.get<StockSummary>(`${API}/stock/summary`),
  });

  protected readonly low = rxResource({
    request: () => (this.business.can('stock:view') ? this.scope() : undefined),
    loader: () => this.http.get<StockRow[]>(`${API}/stock/low`),
  });

  private readonly billingState = inject(BillingService);
  protected readonly billing = this.billingState.billing;
  protected readonly trialLeft = this.billingState.trialDaysLeft;

  /** The sales chart: the last 7 or 30 days. */
  protected readonly span = signal<7 | 30>(7);
  protected readonly spans = [
    { value: 7, label: 'dashboard.days7' },
    { value: 30, label: 'dashboard.days30' },
  ];

  protected readonly chartDays = computed(() => (this.data.value()?.days ?? []).slice(-this.span()));
  protected readonly chartTotal = computed(() => this.chartDays().reduce((sum, d) => sum + d.sales, 0));
  protected readonly chartPoints = computed<BarPoint[]>(() => {
    this.lang.lang(); // labels follow the language
    return this.chartDays().map((d) => {
      const date = new Date(d.day + 'T00:00:00');
      const label = this.span() === 7 ? this.translate.instant('dashboard.weekday.' + date.getDay()) : String(date.getDate());
      const profit = d.profit == null ? '' : ` · ${this.translate.instant('reports.grossProfit')} ${USD.format(d.profit)}`;
      return { key: d.day, label, value: d.sales, tip: `${formatDay(date)}: ${USD.format(d.sales)}${profit}` };
    });
  });
  protected readonly money = (v: number) => USD_SHORT.format(v);

  /** Bars of the best sellers, as a share of the first. */
  protected readonly topMax = computed(() => Math.max(1, ...(this.data.value()?.topProducts ?? []).map((p) => p.sales)));

  /** Trial days left, while the top banner (last 7 days without a plan) is not already saying so. */
  protected readonly trialDaysLeft = computed(() => {
    const days = this.billingState.trialDaysLeft();
    return days != null && (days > 7 || this.billing()?.subscribed) ? days : null;
  });

  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');

  /** Something waits for the member (approvals, transfers to receive, counts in progress). */
  protected readonly waitingCount = computed(() => {
    const w = this.data.value()?.waiting;
    return w
      ? (w.approvals ?? 0) + (w.transfersToReceive ?? 0) + (w.countsInProgress ?? 0) + (w.countsToApprove ?? 0)
        + (w.returnsToApprove ?? 0) + (w.purchaseReturnsToApprove ?? 0)
      : 0;
  });

  /** Plan usage for the Owner (PLAIN.md 12.3), as a share of the limit. */
  protected usagePercent(used: number, limit: number | null): number {
    return limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }
}

function formatDay(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}
