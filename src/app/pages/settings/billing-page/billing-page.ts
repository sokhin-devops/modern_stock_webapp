import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { ProgressBar } from 'primeng/progressbar';
import { ProgressSpinner } from 'primeng/progressspinner';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { switchMap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AlertsService } from '../../../core/alerts.service';
import { ApiService } from '../../../core/api/api.service';
import { AddonView, Billing, BillingCycle, BillingInvoice, BillingPayment, MyAddon, PlanView } from '../../../core/api/models';
import { BillingService } from '../../../core/billing.service';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { ImageField } from '../../../shared/image-field/image-field';
import { PrintDialog, PrintDocument } from '../../../shared/print-dialog/print-dialog';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** What a plan card's button does for this business now. */
type PlanAction = 'current' | 'chosen' | 'choose' | 'subscribe' | 'upgrade' | 'downgrade' | 'toFree' | 'switchCycle' | 'none';

/** The limits shown on each plan card, in this order. */
const LIMITS = ['branches', 'members', 'products', 'telegram_alerts', 'excel_export', 'tax_invoice'];
const COUNTED = ['branches', 'members', 'products'];

/** GET /billing/keep: what stays active when limits go down (FR-10.18). */
interface KeepChoices {
  branchLimit: number | null;
  memberLimit: number | null;
  branches: { id: number; name: string; main: boolean; readOnly: boolean; keep: boolean }[];
  members: { id: number; name: string; role: string; owner: boolean; disabledByPlan: boolean; keep: boolean }[];
}

/**
 * Plan and billing for Owners (prototype billing.html, FR-10.2 to FR-10.18): the plan and its status, usage, the plans
 * monthly or yearly with what each button does now, add-ons, billing invoices, paying them (demo gateway or bank
 * transfer screenshot), and which branches and members stay active when limits go down.
 */
@Component({
  selector: 'ms-billing-page',
  imports: [
    FormsModule, TranslatePipe, DatePipe, CurrencyPipe, DecimalPipe, ProgressBar, ProgressSpinner, TableModule, Dialog, SelectButton, InputNumber,
    Checkbox, ButtonDirective, ButtonIcon, ButtonLabel, FieldLabel, ImageField, PrintDialog, InputText,
  ],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss',
})
export class BillingPage {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly business = inject(BusinessService);
  private readonly alerts = inject(AlertsService);
  private readonly lang = inject(LangService);
  protected readonly state = inject(BillingService);

  protected readonly billing = this.state.billing;
  protected readonly invoices = signal<BillingInvoice[]>([]);
  protected readonly busy = signal<string | null>(null);
  /** A coupon code being typed (FR-10.16). */
  protected readonly couponCode = signal('');
  protected readonly limits = LIMITS;
  protected readonly counted = COUNTED;

  /** Monthly or yearly prices on the plan cards; starts at the business's own cycle. */
  protected readonly cycle = linkedSignal<BillingCycle>(() => this.billing()?.pendingBillingCycle ?? this.billing()?.billingCycle ?? 'MONTHLY');
  protected readonly cycles = [
    { value: 'MONTHLY', label: 'settings.billing.MONTHLY' },
    { value: 'YEARLY', label: 'settings.billing.YEARLY' },
  ];

  /** The pay dialog: the invoice, how it is paid, and where the payment is. */
  protected readonly paying = signal<BillingInvoice | null>(null);
  protected readonly payMethod = signal<'card' | 'transfer'>('card');
  protected readonly payState = signal<'idle' | 'pending' | 'succeeded' | 'failed' | 'sent'>('idle');
  protected readonly payError = signal<string | null>(null);
  /** Card always; bank transfer when the server has an account to send it to. */
  protected readonly payMethods = computed(() => [
    { value: 'card', label: 'settings.billing.payCard' },
    ...(this.billing()?.transferAccounts.length ? [{ value: 'transfer', label: 'settings.billing.payTransfer' }] : []),
  ]);
  protected readonly bank = signal<string | null>(null);
  protected readonly proof = signal<File | null>(null);

  /** The add-on dialog (FR-10.6). */
  protected readonly adding = signal<AddonView | null>(null);
  protected readonly addQty = signal(1);

  /** The "what stays active" dialog (FR-10.18). */
  protected readonly keep = signal<KeepChoices | null>(null);

  protected readonly currentPlan = computed(() => this.billing()?.plans.find((p) => p.code === this.billing()?.planCode) ?? null);
  protected readonly pendingPlan = computed(() => this.billing()?.plans.find((p) => p.code === this.billing()?.pendingPlanCode) ?? null);
  protected readonly onFree = computed(() => ['EXPIRED', 'CANCELLED'].includes(this.billing()?.status ?? ''));
  /** Add-ons come with an active paid plan that is not ending. */
  protected readonly canAddons = computed(() => this.billing()?.status === 'ACTIVE' && !this.billing()?.cancelAtPeriodEnd);
  protected readonly waitingTransfer = computed(() => this.billing()?.openInvoices.find((i) => i.transferPending) ?? null);
  protected readonly keptBranches = computed(() => (this.keep()?.branches ?? []).filter((b) => !b.main && b.keep).length);
  protected readonly keptMembers = computed(() => (this.keep()?.members ?? []).filter((m) => !m.owner && m.keep).length);
  protected readonly ownerCount = computed(() => (this.keep()?.members ?? []).filter((m) => m.owner).length);

  /** The billing invoice or receipt being previewed for printing (FR-10.12). */
  protected readonly printDoc = signal<PrintDocument | null>(null);
  protected readonly printOpen = signal(false);

  constructor() {
    this.state.reload();
    this.loadInvoices();
  }

  protected price(plan: PlanView): number {
    return this.cycle() === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
  }

  protected addonPrice(a: AddonView): number {
    return (this.billing()?.billingCycle === 'YEARLY' ? a.priceYearly : a.priceMonthly);
  }

  protected addonName(a: AddonView | MyAddon | null): string {
    return a ? this.lang.name(a.name, a.nameKm) : '';
  }

  protected mine(a: AddonView): MyAddon[] {
    return (this.billing()?.myAddons ?? []).filter((m) => m.code === a.code);
  }

  /** A feature the plan in effect already has needs no add-on. */
  protected included(a: AddonView, b: Billing): boolean {
    const plan = b.plans.find((p) => p.code === b.planCode);
    const value = plan?.limits[a.limitKey];
    return COUNTED.includes(a.limitKey) ? value === null : value == null || value > 0;
  }

  protected action(plan: PlanView, b: Billing): PlanAction {
    const free = plan.priceMonthly <= 0;
    switch (b.status) {
      case 'TRIALING':
        return free ? 'none' : b.subscribed && plan.code === b.planCode && this.cycle() === b.billingCycle ? 'chosen' : 'choose';
      case 'ACTIVE': {
        if (plan.code === b.planCode) {
          return this.cycle() === (b.pendingBillingCycle ?? b.billingCycle) ? 'current' : 'switchCycle';
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
    const cycle = this.cycle();
    switch (this.action(plan, b)) {
      case 'choose':
        this.run('/billing/change-plan', { planCode: plan.code, cycle }, () =>
          this.notify.showKey('settings.billing.chosenToast', { plan: name, date: this.day(b.trialEndsAt) }),
        );
        break;
      case 'subscribe':
        this.run('/billing/subscribe', { planCode: plan.code, cycle }, (r) => this.openPay(r.openInvoice));
        break;
      case 'upgrade':
        this.ask('settings.billing.upgradeTitle', 'settings.billing.upgradeAsk', { plan: name, date: this.day(b.currentPeriodEnd) }, () =>
          this.run('/billing/change-plan', { planCode: plan.code, cycle }, (r) => this.openPay(this.newest(r, 'UPGRADE'))),
        );
        break;
      case 'downgrade':
        this.ask('settings.billing.downgradeTitle', 'settings.billing.downgradeAsk', { plan: name, date: this.day(b.currentPeriodEnd) }, () =>
          this.run('/billing/change-plan', { planCode: plan.code, cycle }, () => this.notify.showKey('settings.saved')),
        );
        break;
      case 'switchCycle':
        this.run('/billing/change-plan', { planCode: plan.code, cycle }, () =>
          this.notify.showKey('settings.billing.cycleToast', { date: this.day(b.currentPeriodEnd) }),
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

  /** Drops a downgrade or a cycle change that waits for the end of the period. */
  protected keepPlan(b: Billing): void {
    this.run('/billing/change-plan', { planCode: b.planCode }, () => this.notify.showKey('settings.saved'));
  }

  // ---------------------------------------------------------------- add-ons

  protected openAddon(a: AddonView): void {
    this.adding.set(a);
    this.addQty.set(1);
  }

  protected buyAddon(): void {
    const a = this.adding();
    if (!a) {
      return;
    }
    this.run('/billing/addons', { code: a.code, quantity: COUNTED.includes(a.limitKey) ? this.addQty() : 1 }, (r) => {
      this.adding.set(null);
      this.openPay(this.newest(r, 'ADDON'));
    });
  }

  protected removeAddon(m: MyAddon): void {
    const b = this.billing();
    this.ask('settings.billing.addonRemoveTitle', m.status === 'PENDING' ? 'settings.billing.addonRemoveNowAsk' : 'settings.billing.addonRemoveAsk',
      { name: this.addonName(m), date: this.day(b?.currentPeriodEnd ?? null) }, () => this.call('delete', `/billing/addons/${m.id}`));
  }

  protected keepAddon(m: MyAddon): void {
    this.call('post', `/billing/addons/${m.id}/keep`);
  }

  // ---------------------------------------------------------------- paying

  protected openPay(invoice: BillingInvoice | null): void {
    if (invoice) {
      this.paying.set(invoice);
      this.payMethod.set(this.billing()?.demo || this.payMethods().length === 1 ? 'card' : 'transfer');
      this.payState.set('idle');
      this.payError.set(null);
      this.bank.set(this.billing()?.banks[0] ?? null);
      this.proof.set(null);
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

  /** A bank transfer (FR-10.14): the screenshot goes to the super admin, who approves it. */
  protected sendTransfer(): void {
    const invoice = this.paying();
    const file = this.proof();
    if (!invoice || !file || !this.bank()) {
      return;
    }
    const form = new FormData();
    form.append('bank', this.bank()!);
    form.append('file', file);
    this.payState.set('pending');
    this.http.post<BillingPayment>(`${environment.apiUrl}/billing/invoices/${invoice.id}/transfer`, form).subscribe({
      next: () => {
        this.payState.set('sent');
        this.refreshAll();
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

  // ---------------------------------------------------------------- what stays active

  protected openKeep(): void {
    this.api.get<KeepChoices>('/billing/keep').subscribe({ next: (k) => this.keep.set(k), error: (e) => this.notify.error(e) });
  }

  protected toggleKeep(kind: 'branches' | 'members', id: number, on: boolean): void {
    this.keep.update((k) => (k ? { ...k, [kind]: k[kind].map((x) => (x.id === id ? { ...x, keep: on } : x)) } : k));
  }

  /** Places left after the main branch (or the Owners); null = no limit. */
  protected places(limit: number | null, fixed: number): number | null {
    return limit == null ? null : Math.max(0, limit - fixed);
  }

  protected saveKeep(): void {
    const k = this.keep();
    if (!k) {
      return;
    }
    this.busy.set('/billing/keep');
    this.api
      .put<KeepChoices>('/billing/keep', {
        branchIds: k.branches.filter((b) => b.keep).map((b) => b.id),
        memberIds: k.members.filter((m) => m.keep).map((m) => m.id),
      })
      .subscribe({
        next: () => {
          this.busy.set(null);
          this.keep.set(null);
          this.notify.showKey('settings.saved');
          this.business.loadContext().subscribe();
        },
        error: (e) => {
          this.busy.set(null);
          this.notify.error(e);
        },
      });
  }

  // ---------------------------------------------------------------- helpers

  protected limitValue(plan: PlanView, key: string): string | null {
    const v = plan.limits[key];
    if (!COUNTED.includes(key)) {
      return null; // shown as a check or a dash
    }
    return v == null ? this.translate.instant('dashboard.unlimited') : v.toLocaleString('en-US');
  }

  protected percent(used: number, limit: number | null): number {
    return limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  }

  protected redeemCoupon(): void {
    const code = this.couponCode().trim();
    if (!code) {
      return;
    }
    this.run('/billing/coupon', { code }, (b) => {
      this.couponCode.set('');
      this.notify.showKey('settings.billing.couponApplied', { code: b.coupon?.code ?? code.toUpperCase() });
    });
  }

  /** What an invoice is for: its own description, or the plan and kind. */
  protected what(i: BillingInvoice): string {
    return i.description ?? `${i.planName} · ${this.translate.instant('settings.billing.kind.' + i.kind)}`;
  }

  private newest(b: Billing, kind: BillingInvoice['kind']): BillingInvoice | null {
    return [...b.openInvoices].reverse().find((i) => i.kind === kind) ?? b.openInvoice;
  }

  private run(path: string, body: object, done: (b: Billing) => void): void {
    this.busy.set(path);
    this.api.post<Billing>(path, body).subscribe({
      next: (b) => this.applied(b, done),
      error: (e) => {
        this.busy.set(null);
        this.notify.error(e);
      },
    });
  }

  private call(method: 'post' | 'delete', path: string): void {
    this.busy.set(path);
    (method === 'post' ? this.api.post<Billing>(path) : this.api.delete<Billing>(path)).subscribe({
      next: (b) => this.applied(b, () => this.notify.showKey('settings.saved')),
      error: (e) => {
        this.busy.set(null);
        this.notify.error(e);
      },
    });
  }

  private applied(b: Billing, done: (b: Billing) => void): void {
    this.busy.set(null);
    this.billing.set(b);
    this.loadInvoices();
    this.alerts.refresh();
    done(b);
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

  // ---------------------------------------------------------------- printing (FR-10.12)

  /** A billing invoice, or its receipt once paid: ModernStock issues it and the business is billed. */
  protected printInvoice(i: BillingInvoice): void {
    const t = (key: string): string => this.translate.instant(key);
    const issuer = this.billing()?.issuer;
    const profile = this.business.profile();
    const paid = i.status === 'PAID';
    const amount = USD.format(i.amount);
    const facts = [
      { label: t('settings.billing.period'), value: `${this.day(i.periodStart)} – ${this.day(i.periodEnd)}` },
      { label: t('settings.billing.cycle'), value: t('settings.billing.' + i.billingCycle) },
    ];
    if (paid) {
      facts.unshift({ label: t('settings.billing.print.invoiceDate'), value: this.day(i.createdAt) });
      if (i.paidWith) {
        facts.push({ label: t('settings.billing.print.paidBy'), value: this.paidBy(i.paidWith) });
      }
    }
    const totals = [{ label: t('common.total'), value: amount, strong: i.status === 'VOID' }];
    if (i.status !== 'VOID') {
      totals.push({ label: t(paid ? 'print.paid' : 'settings.billing.print.toPay'), value: amount, strong: true });
    }
    this.printDoc.set({
      issuer: issuer && {
        name: issuer.name,
        lines: [issuer.address, [issuer.phone, issuer.email].filter(Boolean).join(' · '),
          issuer.vatTin ? `${t('print.vatTin')}: ${issuer.vatTin}` : null].filter((x): x is string => !!x),
      },
      title: t(paid ? 'settings.billing.print.receipt' : 'settings.billing.print.invoice'),
      number: i.number,
      date: (paid && i.paidAt) || i.createdAt,
      facts,
      partyLabel: t('print.billTo'),
      partyName: profile ? this.lang.name(profile.nameEn, profile.nameKm) : '',
      partyLines: profile
        ? [profile.address, profile.phone, profile.vatTin ? `${t('print.vatTin')}: ${profile.vatTin}` : null].filter((x): x is string => !!x)
        : [],
      withPrices: true,
      itemLabel: t('settings.billing.print.item'),
      lines: [{ name: this.what(i), qty: 1, unit: '', price: i.amount, total: i.amount }],
      totals,
      signatures: false,
      note: i.status === 'VOID' ? t('settings.billing.print.voidNote') : null,
    });
    this.printOpen.set(true);
  }

  private paidBy(p: BillingPayment): string {
    if (p.gateway !== 'BANK_TRANSFER') {
      return this.translate.instant(this.billing()?.demo ? 'settings.billing.print.demo' : 'settings.billing.payCard');
    }
    const bank = p.bank === 'OTHER' ? this.translate.instant('settings.billing.otherBank') : p.bank;
    return [this.translate.instant('settings.billing.payTransfer'), bank].filter(Boolean).join(' · ');
  }

  private day(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('en-GB') : '';
  }
}
