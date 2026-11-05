import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';
import { FieldLabel } from '../../shared/field-label/field-label';
import { AdminCoupons } from '../admin-coupons/admin-coupons';

interface PlanRow {
  id: number;
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  publicPlan: boolean;
  /** null = unlimited; a feature: 1 on, 0 off. */
  limits: Record<string, number | null>;
  subscriptions: number;
}

interface AddonRow {
  id: number;
  code: string;
  name: string;
  nameKm: string | null;
  limitKey: string;
  quantity: number;
  priceMonthly: number;
  active: boolean;
  inUse: number;
}

const COUNTS = ['branches', 'members', 'products'];
const FEATURES = ['telegram_alerts', 'excel_export', 'tax_invoice'];

/**
 * Plans and add-ons (FR-8.5): prices and limits on a screen. A plan's prices apply to the next invoices and its limits
 * at once; the Free plan stays free. An empty limit means unlimited.
 */
@Component({
  selector: 'ms-admin-plans',
  imports: [
    FormsModule, TranslatePipe, CurrencyPipe, DecimalPipe, TableModule, Dialog, InputNumber, InputText, ToggleSwitch, ButtonDirective, ButtonLabel, FieldLabel,
    AdminCoupons,
  ],
  templateUrl: './admin-plans.html',
  styleUrls: ['../admin-tab.scss', './admin-plans.scss'],
})
export class AdminPlans {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly counts = COUNTS;
  protected readonly features = FEATURES;
  protected readonly plans = signal<PlanRow[]>([]);
  protected readonly addons = signal<AddonRow[]>([]);
  protected readonly plan = signal<PlanRow | null>(null);
  protected readonly addon = signal<AddonRow | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    this.api.get<PlanRow[]>('/admin/plans').subscribe({ next: (p) => this.plans.set(p), error: (e) => this.notify.error(e) });
    this.api.get<AddonRow[]>('/admin/addons').subscribe({ next: (a) => this.addons.set(a), error: (e) => this.notify.error(e) });
  }

  /** Edits a copy, so Cancel leaves the table as it was. */
  protected editPlan(p: PlanRow): void {
    this.plan.set({ ...p, limits: { ...p.limits } });
  }

  protected editAddon(a: AddonRow): void {
    this.addon.set({ ...a });
  }

  protected setPlan<K extends keyof PlanRow>(key: K, value: PlanRow[K]): void {
    this.plan.update((p) => (p ? { ...p, [key]: value } : p));
  }

  protected setLimit(key: string, value: number | null): void {
    this.plan.update((p) => (p ? { ...p, limits: { ...p.limits, [key]: value } } : p));
  }

  protected setAddon<K extends keyof AddonRow>(key: K, value: AddonRow[K]): void {
    this.addon.update((a) => (a ? { ...a, [key]: value } : a));
  }

  protected savePlan(): void {
    const p = this.plan();
    if (!p) {
      return;
    }
    this.busy.set(true);
    this.api
      .put<PlanRow[]>(`/admin/plans/${p.id}`, {
        name: p.name, priceMonthly: p.priceMonthly ?? 0, priceYearly: p.priceYearly, publicPlan: p.publicPlan, limits: p.limits,
      })
      .subscribe({
        next: (list) => this.saved(() => this.plans.set(list), () => this.plan.set(null)),
        error: (e) => this.failed(e),
      });
  }

  protected saveAddon(): void {
    const a = this.addon();
    if (!a) {
      return;
    }
    this.busy.set(true);
    this.api
      .put<AddonRow[]>(`/admin/addons/${a.id}`, { name: a.name, nameKm: a.nameKm, quantity: a.quantity, priceMonthly: a.priceMonthly ?? 0, active: a.active })
      .subscribe({
        next: (list) => this.saved(() => this.addons.set(list), () => this.addon.set(null)),
        error: (e) => this.failed(e),
      });
  }

  private saved(update: () => void, close: () => void): void {
    this.busy.set(false);
    update();
    close();
    this.notify.showKey('common.saved');
  }

  private failed(e: unknown): void {
    this.busy.set(false);
    this.notify.error(e);
  }
}
