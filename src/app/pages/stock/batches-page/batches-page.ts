import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { of } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BatchRow } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { fromIsoDate } from '../../../shared/dates';
import { exportList } from '../../../shared/list-export';
import { warehouseOptions } from '../../../shared/options';

/** Expired, or expiring within the days picked; "all" is every batch with an expiry date. */
type Window = 'expired' | '30' | '60' | '90' | 'all';

const DAYS: Record<Window, number> = { expired: -1, '30': 30, '60': 60, '90': 90, all: 3650 };

/**
 * Batches and expiry (PLAIN.md 11.2, 12.2): every batch in stock with an expiry date, soonest first, with how long it
 * has left; expired ones first in red. A row opens the product's stock card. ?window=expired|30|60|90 picks the list
 * (the dashboard's near-expiry card links here).
 */
@Component({
  selector: 'ms-batches-page',
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe, TableModule, Select, IconField, InputIcon, InputText, ButtonDirective, ButtonIcon, ButtonLabel],
  templateUrl: './batches-page.html',
  styleUrl: './batches-page.scss',
})
export class BatchesPage {
  readonly windowParam = input<string | undefined>(undefined, { alias: 'window' });

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  protected readonly lang = inject(LangService);

  protected readonly window = signal<Window>('90');
  protected readonly windows: { value: Window; label: string }[] = [
    { value: 'expired', label: 'batches.expired' },
    { value: '30', label: 'batches.within30' },
    { value: '60', label: 'batches.within60' },
    { value: '90', label: 'batches.within90' },
    { value: 'all', label: 'batches.all' },
  ];
  protected readonly warehouseId = signal<number | null>(null);
  protected readonly warehouseChoices = computed(() =>
    warehouseOptions(this.business.pickableBranches(), this.lang, this.business.branchId()),
  );
  protected readonly q = signal('');
  protected readonly batches = signal<BatchRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  /** The search filters what is loaded (one list, not pages). */
  protected readonly shown = computed(() => {
    const q = this.q().toLowerCase();
    return q
      ? this.batches().filter((b) => b.productName.toLowerCase().includes(q) || (b.batchNo ?? '').toLowerCase().includes(q))
      : this.batches();
  });

  private readonly today = new Date(new Date().setHours(0, 0, 0, 0));

  constructor() {
    effect(() => {
      const w = this.windowParam();
      if (w && w in DAYS) {
        untracked(() => this.window.set(w as Window));
      } else if (w && Number(w) > 0) {
        // the business's own near-expiry windows (FR-7.10): the list that covers them
        const n = Number(w);
        untracked(() => this.window.set(n <= 30 ? '30' : n <= 60 ? '60' : n <= 90 ? '90' : 'all'));
      }
    });
    effect(() => {
      this.window();
      this.warehouseId();
      this.business.branchId();
      this.business.businessId();
      untracked(() => this.load());
    });
  }

  /** Days until it expires; negative once it has. */
  protected daysLeft(b: BatchRow): number {
    const d = fromIsoDate(b.expiryDate);
    return d ? Math.round((d.getTime() - this.today.getTime()) / 86400000) : 0;
  }

  protected openCard(b: BatchRow): void {
    void this.router.navigate(['/inventory/stock-card'], { queryParams: { product: b.productId } });
  }

  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    const rows = this.shown();
    this.exporting.set(true);
    try {
      await exportList<BatchRow>(
        () => of({ content: rows, page: 0, size: rows.length, totalElements: rows.length, totalPages: 1 }),
        [
          { header: t('products.colProduct'), value: (b) => b.productName },
          { header: t('stock.batch'), value: (b) => b.batchNo },
          { header: t('stock.warehouse'), value: (b) => b.warehouseName },
          { header: t('stock.expiry'), value: (b) => b.expiryDate },
          { header: t('batches.daysLeft'), value: (b) => this.daysLeft(b) },
          { header: t('stock.onHand'), value: (b) => b.qtyOnHand },
        ],
        'batches',
      );
    } finally {
      this.exporting.set(false);
    }
  }

  private load(): void {
    const params = [`expiringInDays=${DAYS[this.window()]}`, this.warehouseId() ? `warehouseId=${this.warehouseId()}` : '']
      .filter(Boolean)
      .join('&');
    this.loading.set(true);
    this.api.get<BatchRow[]>(`/stock/batches?${params}`).subscribe({
      next: (list) => {
        this.loading.set(false);
        this.batches.set(list);
      },
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
  }
}
