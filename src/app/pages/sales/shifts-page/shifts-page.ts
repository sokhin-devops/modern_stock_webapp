import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../../core/api/api.service';
import { CashShift } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { LazyList } from '../../../shared/lazy-list';
import { exportList } from '../../../shared/list-export';

/**
 * Cash shifts (prototype shifts.html, PLAIN.md 11.5): each cashier's shifts with the cash that should be in the drawer,
 * what was counted, and the difference (over or short). Cashiers see their own; managers see everyone's. Filter by
 * status and dates; a row opens the shift's cash, step by step.
 */
@Component({
  selector: 'ms-shifts-page',
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe, TableModule, Select, DatePicker, Dialog, ButtonDirective, ButtonIcon, ButtonLabel],
  templateUrl: './shifts-page.html',
  styleUrl: './shifts-page.scss',
})
export class ShiftsPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);

  protected readonly status = signal<'OPEN' | 'CLOSED' | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly statuses = [
    { value: 'OPEN', label: 'docs.status.OPEN' },
    { value: 'CLOSED', label: 'docs.status.CLOSED' },
  ];
  protected readonly viewing = signal<CashShift | null>(null);
  protected readonly exporting = signal(false);

  protected readonly list = new LazyList<CashShift>(
    (q) => this.api.page('/cash-shifts', q, this.filters()),
    (e) => this.notify.error(e),
    'openedAt,desc',
  );

  constructor() {
    let first = true;
    effect(() => {
      this.business.branchId();
      this.business.businessId();
      if (first) {
        first = false;
        return;
      }
      untracked(() => this.list.reload());
    });
  }

  protected setStatus(v: 'OPEN' | 'CLOSED' | null): void {
    this.status.set(v);
    this.list.reload();
  }

  protected setFrom(d: Date | null): void {
    this.from.set(d);
    this.list.reload();
  }

  protected setTo(d: Date | null): void {
    this.to.set(d);
    this.list.reload();
  }

  protected open(s: CashShift): void {
    this.api.get<CashShift>(`/cash-shifts/${s.id}`).subscribe({ next: (full) => this.viewing.set(full), error: (e) => this.notify.error(e) });
  }

  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    this.exporting.set(true);
    try {
      await exportList<CashShift>(
        (page, size) => this.api.page<CashShift>('/cash-shifts', { page, size, sort: 'openedAt,desc' }, this.filters()),
        [
          { header: t('shifts.cashier'), value: (s) => s.cashierName },
          { header: t('shifts.opened'), value: (s) => s.openedAt.slice(0, 16).replace('T', ' ') },
          { header: t('shifts.closed'), value: (s) => s.closedAt?.slice(0, 16).replace('T', ' ') },
          { header: `${t('shifts.expected')} USD`, value: (s) => s.expectedUsd, format: '#,##0.00' },
          { header: `${t('shifts.expected')} KHR`, value: (s) => s.expectedKhr, format: '#,##0' },
          { header: `${t('shifts.counted')} USD`, value: (s) => s.countedUsd, format: '#,##0.00' },
          { header: `${t('shifts.counted')} KHR`, value: (s) => s.countedKhr, format: '#,##0' },
          { header: `${t('shifts.difference')} USD`, value: (s) => s.differenceUsd, format: '#,##0.00' },
          { header: `${t('shifts.difference')} KHR`, value: (s) => s.differenceKhr, format: '#,##0' },
          { header: t('shifts.receipts'), value: (s) => s.receipts },
          { header: t('common.status'), value: (s) => t('docs.status.' + s.status) },
        ],
        'cash-shifts',
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  private filters(): Record<string, string | null> {
    return { status: this.status(), from: toIsoDate(this.from()), to: toIsoDate(this.to()) };
  }
}
