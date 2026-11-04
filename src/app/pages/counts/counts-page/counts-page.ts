import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Drawer } from 'primeng/drawer';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { LazyList } from '../../../shared/lazy-list';
import { warehouseOptions } from '../../../shared/options';

interface CountLine {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  unitSymbol: string;
  systemQty: number;
  countedQty: number | null;
  difference: number | null;
  value: number | null;
}

interface StockCount {
  id: number;
  number: string;
  warehouseName: string;
  status: 'DRAFT' | 'POSTED' | 'VOID';
  note: string | null;
  createdAt: string;
  postedAt: string | null;
  counted: number;
  differences: number;
  differenceValue: number;
  lines: CountLine[];
}

/**
 * Stock counts (prototype stock-counts.html / stock-count.html, PLAIN.md 11.2): start a count for a warehouse (or one
 * category), type what is on the shelf, save as often as needed, and post: each difference changes the stock.
 */
@Component({
  selector: 'ms-counts-page',
  imports: [
    FormsModule, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Dialog, Drawer, IconField, InputIcon,
    InputNumber, InputText, ProgressBar, Select, ButtonDirective, ButtonIcon, ButtonLabel, FieldLabel,
  ],
  templateUrl: './counts-page.html',
  styleUrl: './counts-page.scss',
})
export class CountsPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly catalog = inject(CatalogService);
  protected readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly list = new LazyList<StockCount>((q) => this.api.page('/stock-counts', q), (e) => this.notify.error(e));
  protected readonly warehouses = computed(() => warehouseOptions(this.business.branches(), this.lang, this.business.branchId()));
  protected readonly categories = computed(() =>
    this.catalog.categories().map((c) => ({ value: c.id, label: this.lang.name(c.nameEn, c.nameKm) })),
  );

  // Start dialog
  protected readonly startOpen = signal(false);
  protected readonly warehouseId = signal<number | null>(null);
  protected readonly categoryId = signal<number | null>(null);

  // The open count
  protected readonly count = signal<StockCount | null>(null);
  protected readonly filter = signal('');
  protected readonly shown = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const lines = this.count()?.lines ?? [];
    return q ? lines.filter((l) => l.productName.toLowerCase().includes(q) || l.sku.toLowerCase().includes(q)) : lines;
  });
  protected readonly progress = computed(() => {
    const lines = this.count()?.lines ?? [];
    return lines.length ? Math.round((lines.filter((l) => l.countedQty != null).length / lines.length) * 100) : 0;
  });
  protected readonly busy = signal(false);

  constructor() {
    this.catalog.loadLists();
  }

  protected openStart(): void {
    this.warehouseId.set(this.warehouses()[0]?.value ?? null);
    this.categoryId.set(null);
    this.startOpen.set(true);
  }

  protected start(): void {
    this.busy.set(true);
    this.api.post<StockCount>('/stock-counts', { warehouseId: this.warehouseId(), categoryId: this.categoryId() }).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.startOpen.set(false);
        this.count.set(c);
        this.list.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected open(c: StockCount): void {
    this.filter.set('');
    this.api.get<StockCount>(`/stock-counts/${c.id}`).subscribe({ next: (full) => this.count.set(full), error: (e) => this.notify.error(e) });
  }

  protected setCounted(line: CountLine, value: number | null): void {
    this.count.update((c) =>
      c ? { ...c, lines: c.lines.map((l) => (l.id === line.id ? { ...l, countedQty: value, difference: value == null ? null : value - l.systemQty } : l)) } : c,
    );
  }

  protected save(after?: () => void): void {
    const c = this.count();
    if (!c) {
      return;
    }
    this.busy.set(true);
    this.api
      .put<StockCount>(`/stock-counts/${c.id}/lines`, { lines: c.lines.map((l) => ({ itemId: l.id, countedQty: l.countedQty })) })
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.count.set(saved);
          if (after) {
            after();
          } else {
            this.notify.showKey('common.saved');
          }
          this.list.refresh();
        },
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }

  protected post(): void {
    const c = this.count();
    if (!c) {
      return;
    }
    this.confirm.confirm({
      header: this.translate.instant('counts.post'),
      message: this.translate.instant('counts.postConfirm', { number: c.number }),
      acceptLabel: this.translate.instant('counts.post'),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: { text: true },
      accept: () =>
        this.save(() =>
          this.api.post<StockCount>(`/stock-counts/${c.id}/post`).subscribe({
            next: (posted) => {
              this.count.set(posted);
              this.notify.showKey('counts.posted');
              this.list.refresh();
            },
            error: (e) => this.notify.error(e),
          }),
        ),
    });
  }

  protected remove(): void {
    const c = this.count();
    if (!c) {
      return;
    }
    this.api.delete(`/stock-counts/${c.id}`).subscribe({
      next: () => {
        this.count.set(null);
        this.list.reload();
      },
      error: (e) => this.notify.error(e),
    });
  }
}
