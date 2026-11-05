import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';
import { toIsoDate } from '../../shared/dates';
import { FieldLabel } from '../../shared/field-label/field-label';

interface CouponRow {
  id: number | null;
  code: string;
  percentOff: number;
  /** Full-period invoices it discounts. */
  periods: number;
  /** null = no limit. */
  maxRedemptions: number | null;
  expiresOn: string | null;
  active: boolean;
  note: string | null;
  /** Businesses that entered it. */
  redemptions: number;
}

/**
 * Coupons (FR-10.16), under Plans: a code, how much off, for how many invoices, how many businesses may use it and
 * until when. Owners enter the code on their Billing page.
 */
@Component({
  selector: 'ms-admin-coupons',
  imports: [
    FormsModule, TranslatePipe, DatePipe, TableModule, Dialog, InputText, InputNumber, DatePicker, ToggleSwitch, ButtonDirective, ButtonIcon,
    ButtonLabel, FieldLabel,
  ],
  templateUrl: './admin-coupons.html',
  styleUrl: './admin-coupons.scss',
})
export class AdminCoupons {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly coupons = signal<CouponRow[]>([]);
  protected readonly editing = signal<CouponRow | null>(null);
  protected readonly expires = signal<Date | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    this.api.get<CouponRow[]>('/admin/coupons').subscribe({ next: (c) => this.coupons.set(c), error: (e) => this.notify.error(e) });
  }

  protected add(): void {
    this.edit({ id: null, code: '', percentOff: 20, periods: 1, maxRedemptions: null, expiresOn: null, active: true, note: null, redemptions: 0 });
  }

  protected edit(c: CouponRow): void {
    this.editing.set({ ...c });
    this.expires.set(c.expiresOn ? new Date(`${c.expiresOn}T00:00:00`) : null);
  }

  protected set<K extends keyof CouponRow>(key: K, value: CouponRow[K]): void {
    this.editing.update((c) => (c ? { ...c, [key]: value } : c));
  }

  protected save(): void {
    const c = this.editing();
    if (!c || !c.code.trim()) {
      return;
    }
    const expires = this.expires();
    const body = {
      code: c.code.trim(),
      percentOff: c.percentOff,
      periods: c.periods,
      maxRedemptions: c.maxRedemptions || null,
      expiresOn: expires ? toIsoDate(expires) : null,
      active: c.active,
      note: c.note?.trim() || null,
    };
    this.busy.set(true);
    (c.id ? this.api.put<CouponRow[]>(`/admin/coupons/${c.id}`, body) : this.api.post<CouponRow[]>('/admin/coupons', body)).subscribe({
      next: (list) => {
        this.busy.set(false);
        this.coupons.set(list);
        this.editing.set(null);
        this.notify.showKey('settings.saved');
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
