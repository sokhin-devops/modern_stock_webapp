import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { ProgressBar } from 'primeng/progressbar';
import { ProgressSpinner } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { switchMap } from 'rxjs';

import { AlertsService } from '../../../core/alerts.service';
import { ApiService } from '../../../core/api/api.service';
import { Billing, BillingInvoice, BillingPayment, PlanView } from '../../../core/api/models';
import { BillingService } from '../../../core/billing.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';

/** What a plan card's button does for this business now. */
type PlanAction = 'current' | 'chosen' | 'choose' | 'subscribe' | 'upgrade' | 'downgrade' | 'toFree' | 'none';

/** The limits shown on each plan card, in this order. */
const LIMITS = ['branches', 'members', 'products', 'telegram_alerts', 'excel_export', 'tax_invoice'];

/**
 * Plan and billing for Owners (prototype billing.html, FR-10.12): the plan and its status, usage, the plans with what
 * each button does now (choose in the trial, subscribe, upgrade, downgrade), billing invoices, and paying them through
 * the demo gateway ("Pay (demo)" / "Fail payment (demo)", no money is charged).
 */
@Component({
  selector: 'ms-billing-page',
  imports: [TranslatePipe, DatePipe, CurrencyPipe, ProgressBar, ProgressSpinner, TableModule, Dialog, ButtonDirective, ButtonIcon, ButtonLabel],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss',
})
export class BillingPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly business = inject(BusinessService);
  private readonly alerts = inject(AlertsService);
  protected readonly state = inject(BillingService);

  protected readonly billing = this.state.billing;
  protected readonly invoices = signal<BillingInvoice[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly limits = LIMITS;

  /** The pay dialog: the invoice, and where its payment is. */
  protected readonly paying = signal<BillingInvoice | null>(null);
  protected readonly payState = signal<'idle' | 'pending' | 'succeeded' | 'failed'>('idle');
  protected readonly payError = signal<string | null>(null);

  protected readonly currentPlan = computed(() => this.billing()?.plans.find((p) => p.code === this.billing()?.planCode) ?? null);
  protected readonly pendingPlan = computed(() => this.billing()?.plans.find((p) => p.code === this.billing()?.pendingPlanCode) ?? null);
  protected readonly onFree = computed(() => ['EXPIRED', 'CANCELLED'].includes(this.billing()?.status ?? ''));

  constructor() {
    this.state.reload();
    this.loadInvoices();
  }

  protected action(plan: PlanView, b: Billing): PlanAction {
    const free = plan.priceMonthly <= 0;
    switch (b.status) {
      case 'TRIALING':
        return free ? 'none' : b.subscribed && plan.code === b.planCode ? 'chosen' : 'choose';
      case 'ACTIVE': {
        if (plan.code === b.planCode) {
          return 'current';
        }
        const current = b.plans.find((p) => p.code === b.planCode);
        if (free) {
          return b.cancelAtPeriodEnd ? 'none' : 'toFree';
        }
        return current && plan.priceMonthly > current.priceMonthly ? 'upgrade' : 'downgrade';
      }
      case 'PAST_DUE':
        return plan.code === b.planCode ? 'current' : 'none';
      default: // EXPIRED, CANCELLED: on Free
        return free ? 'current' : 'subscribe';
    }
  }

  protected act(plan: PlanView, b: Billing): void {
    const name = plan.name;
    switch (this.action(plan, b)) {
      case 'choose':
        this.run('/billing/change-plan', { planCode: plan.code }, () =>
          this.notify.showKey('settings.billing.chosenToast', { plan: name, date: this.day(b.trialEndsAt) }),
        );
        break;
      case 'subscribe':
        this.run('/billing/subscribe', { planCode: plan.code }, (r) => this.openPay(r.openInvoice));
        break;
      case 'upgrade':
        this.ask('settings.billing.upgradeTitle', 'settings.billing.upgradeAsk', { plan: name, price: plan.priceMonthly }, () =>
          this.run('/billing/change-plan', { planCode: plan.code }, (r) => this.openPay(r.openInvoice)),
        );
        break;
      case 'downgrade':
        this.ask('settings.billing.downgradeTitle', 'settings.billing.downgradeAsk', { plan: name, date: this.day(b.currentPeriodEnd) }, () =>
          this.run('/billing/change-plan', { planCode: plan.code }, () => this.notify.showKey('settings.saved')),
        );
        break;
      case 'toFree':
        this.cancel(b);
        break;
    }
  }

  protected cancel(b: Billing): void {
    const key = b.status === 'TRIALING' ? 'settings.billing.cancelTrialAsk' : 'settings.billing.cancelAsk';
    this.ask('settings.billing.cancelTitle', key, { date: this.day(b.currentPeriodEnd ?? b.trialEndsAt) }, () =>
      this.run('/billing/cancel', {}, () => this.notify.showKey('settings.saved')),
    );
  }

  protected resume(): void {
    this.run('/billing/resume', {}, () => this.notify.showKey('settings.saved'));
  }

  /** Drops a downgrade that waits for the end of the period. */
  protected keepPlan(b: Billing): void {
    this.run('/billing/change-plan', { planCode: b.planCode }, () => this.notify.showKey('settings.saved'));
  }

  protected openPay(invoice: BillingInvoice | null): void {
    if (invoice) {
      this.paying.set(invoice);
      this.payState.set('idle');
      this.payError.set(null);
    }
  }

  /** The demo gateway: the payment starts Pending, then the simulated confirmation succeeds or fails it. */
  protected payDemo(succeed: boolean): void {
    const invoice = this.paying();
    if (!invoice) {
      return;
    }
    this.payState.set('pending');
    this.api.post<BillingPayment>(`/billing/invoices/${invoice.id}/pay`).pipe(
      switchMap((p) => this.api.post<BillingPayment>(`/billing/payments/${p.id}/demo`, { succeed })),
    ).subscribe({
      next: (p) => {
        if (p.status === 'SUCCEEDED') {
          this.payState.set('succeeded');
          this.refreshAll();
        } else {
          this.payState.set('failed');
          this.payError.set(p.failureReason);
          this.loadInvoices();
        }
      },
      error: (e) => {
        this.payState.set('failed');
        this.payError.set(this.notify.message(e));
      },
    });
  }

  protected closePay(): void {
    this.paying.set(null);
  }

  protected limitValue(plan: PlanView, key: string): string | null {
    const v = plan.limits[key];
    if (key === 'telegram_alerts' || key === 'excel_export' || key === 'tax_invoice') {
      return null; // shown as a check or a dash
    }
    return v == null ? this.translate.instant('dashboard.unlimited') : String(v);
  }

  protected percent(used: number, limit: number | null): number {
    return limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }

  private run(path: string, body: object, done: (b: Billing) => void): void {
    this.busy.set(path);
    this.api.post<Billing>(path, body).subscribe({
      next: (b) => {
        this.busy.set(null);
        this.billing.set(b);
        this.loadInvoices();
        this.alerts.refresh();
        done(b);
      },
      error: (e) => {
        this.busy.set(null);
        this.notify.error(e);
      },
    });
  }

  private ask(header: string, message: string, params: object, accept: () => void): void {
    this.confirm.confirm({
      header: this.translate.instant(header),
      message: this.translate.instant(message, params),
      acceptLabel: this.translate.instant('common.continue'),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: { text: true },
      accept,
    });
  }

  /** After a payment the plan, limits, branches and alerts all change. */
  private refreshAll(): void {
    this.state.reload();
    this.loadInvoices();
    this.alerts.refresh();
    this.business.loadContext().subscribe();
  }

  private loadInvoices(): void {
    this.api.get<BillingInvoice[]>('/billing/invoices').subscribe({ next: (list) => this.invoices.set(list) });
  }

  private day(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('en-GB') : '';
  }
}
