import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { filter, map } from 'rxjs';

import { BillingService } from '../../core/billing.service';
import { BusinessService } from '../../core/business/business.service';

/**
 * One banner above every page when the plan needs attention (PLAIN.md 11.13): a payment past due (red, for Owners),
 * the last 7 days of a trial with no plan chosen (for Owners), or a read-only branch selected (for everyone). The
 * billing page says the first two itself, so they are left out there.
 */
@Component({
  selector: 'ms-plan-banner',
  imports: [RouterLink, TranslatePipe, DatePipe, ButtonDirective, ButtonLabel],
  templateUrl: './plan-banner.html',
  styleUrl: './plan-banner.scss',
})
export class PlanBanner {
  protected readonly business = inject(BusinessService);
  protected readonly state = inject(BillingService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly onBillingPage = computed(() => this.url().startsWith('/settings/billing'));

  protected readonly readOnlyBranch = computed(() => {
    const id = this.business.branchId();
    return id != null && !!this.business.branches().find((b) => b.id === id)?.readOnly;
  });

  protected readonly trialEnding = computed(() => {
    const days = this.state.trialDaysLeft();
    return days != null && days <= 7 && !this.state.billing()?.subscribed;
  });
}
