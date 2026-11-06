import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../../core/api/api.service';
import { MovementRow, StockRow } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { LazyList } from '../../../shared/lazy-list';
import { exportList } from '../../../shared/list-export';
import { warehouseOptions } from '../../../shared/options';

interface ProductPick {
  productId: number;
  label: string;
}

/**
 * The stock card (PLAIN.md 11.2, 12.2): every stock movement in and out with the balance after it, newest first, for
 * one product or all, one warehouse or all, in a date range. ?product=<id> opens it on a product.
 */
@Component({
  selector: 'ms-stock-card-page',
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe, TableModule, AutoComplete, Select, DatePicker, ButtonDirective, ButtonIcon, ButtonLabel],
  templateUrl: './stock-card-page.html',
  styleUrl: './stock-card-page.scss',
})
export class StockCardPage {
  /** ?product=<id> */
  readonly productParam = input<string | undefined>(undefined, { alias: 'product' });

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);
  protected readonly lang = inject(LangService);

  protected readonly product = signal<ProductPick | null>(null);
  protected readonly suggestions = signal<ProductPick[]>([]);
  protected readonly warehouseId = signal<number | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly exporting = signal(false);
  protected readonly warehouseChoices = computed(() =>
    warehouseOptions(this.business.pickableBranches(), this.lang, this.business.branchId()),
  );

  protected readonly list = new LazyList<MovementRow>(
    (q) => this.api.page<MovementRow>('/stock/movements', { page: q.page, size: q.size }, this.filters()),
    (e) => this.notify.error(e),
  );

  constructor() {
    effect(() => {
      const id = Number(this.productParam());
      if (id) {
        untracked(() =>
          this.api.get<{ productId: number; nameEn: string }>(`/stock/levels/${id}`).subscribe({
            next: (p) => {
              this.product.set({ productId: id, label: p.nameEn });
              this.list.reload();
            },
          }),
        );
      }
    });
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

  protected find(e: AutoCompleteCompleteEvent): void {
    this.api.page<StockRow>('/stock/levels', { page: 0, size: 10 }, { q: e.query }).subscribe({
      next: (p) => this.suggestions.set(p.content.map((r) => ({ productId: r.productId, label: `${this.lang.name(r.nameEn, r.nameKm)} · ${r.sku}` }))),
    });
  }

  protected setProduct(p: ProductPick | null): void {
    this.product.set(p?.productId ? p : null);
    this.list.reload();
  }

  protected setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
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

  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    this.exporting.set(true);
    try {
      await exportList<MovementRow>(
        (page, size) => this.api.page<MovementRow>('/stock/movements', { page, size }, this.filters()),
        [
          { header: t('stock.date'), value: (m) => m.at.slice(0, 16).replace('T', ' ') },
          { header: t('products.colProduct'), value: (m) => m.productName },
          { header: t('stock.warehouse'), value: (m) => m.warehouseName },
          { header: t('stock.movement'), value: (m) => t('stock.types.' + m.type) },
          { header: t('stock.qty'), value: (m) => m.qty },
          { header: t('stock.balance'), value: (m) => m.balanceAfter },
        ],
        'stock-card',
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  private filters(): Record<string, string | number | null> {
    return {
      productId: this.product()?.productId ?? null,
      warehouseId: this.warehouseId(),
      from: toIsoDate(this.from()),
      to: toIsoDate(this.to()),
    };
  }
}
