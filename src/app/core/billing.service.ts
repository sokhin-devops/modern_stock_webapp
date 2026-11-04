import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { ApiService } from './api/api.service';
import { Billing } from './api/models';
import { BusinessService } from './business/business.service';

const DAY_MS = 86_400_000;

/**
 * The open business's plan and billing (PLAIN.md 11.13), for its Owners: one copy shared by the billing page, the
 * plan banner and the dashboard, reloaded when the business changes or after a billing action.
 */
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);

  readonly billing = signal<Billing | null>(null);

  /** Days left in the trial (null when not in a trial). */
  readonly trialDaysLeft = computed(() => {
    const b = this.billing();
    if (b?.status !== 'TRIALING' || !b.trialEndsAt) {
      return null;
    }
    return Math.max(0, Math.ceil((new Date(b.trialEndsAt).getTime() - Date.now()) / DAY_MS));
  });

  constructor() {
    effect(() => {
      this.business.businessId();
      const owner = this.business.can('billing:manage');
      untracked(() => (owner ? this.reload() : this.billing.set(null)));
    });
  }

  reload(): void {
    this.api.get<Billing>('/billing').subscribe({
      next: (b) => this.billing.set(b),
      error: () => this.billing.set(null),
    });
  }
}
