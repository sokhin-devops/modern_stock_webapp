import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { ProgressBar } from 'primeng/progressbar';

import { environment } from '../../../environments/environment';
import { Billing, StockRow, StockSummary } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';

const API = environment.apiUrl;

/**
 * Dashboard (PLAIN.md 12.3). Built now from the stock API: stock value, in transit, low stock, expiry, and the trial.
 * Sales and profit cards follow with the reports API. Everything reloads when the business or branch changes.
 */
@Component({
  selector: 'ms-dashboard',
  imports: [
    RouterLink, TranslatePipe, CurrencyPipe, DecimalPipe, DatePipe, ButtonDirective, ButtonIcon, ButtonLabel, ProgressBar,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  /** Reload key: the open business and the selected branch. */
  private readonly scope = computed(() => ({ business: this.business.businessId(), branch: this.business.branchId() }));

  protected readonly summary = rxResource({
    request: () => (this.business.can('stock:view') ? this.scope() : undefined),
    loader: () => this.http.get<StockSummary>(`${API}/stock/summary`),
  });

  protected readonly low = rxResource({
    request: () => (this.business.can('stock:view') ? this.scope() : undefined),
    loader: () => this.http.get<StockRow[]>(`${API}/stock/low`),
  });

  protected readonly billing = rxResource({
    request: () => (this.business.can('billing:manage') ? this.scope().business : undefined),
    loader: () => this.http.get<Billing>(`${API}/billing`),
  });

  protected readonly trialDaysLeft = computed(() => {
    const end = this.billing.value()?.trialEndsAt;
    if (!end || this.billing.value()?.status !== 'TRIALING') {
      return null;
    }
    return Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000));
  });

  protected readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');

  /** Plan usage for the Owner (PLAIN.md 12.3), as a share of the limit. */
  protected usagePercent(used: number, limit: number | null): number {
    return limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }
}
