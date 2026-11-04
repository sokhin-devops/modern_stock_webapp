import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Drawer } from 'primeng/drawer';
import { ProgressBar } from 'primeng/progressbar';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';

import { MovementRow, ProductStock, StockRow } from '../../../core/api/models';
import { StockService } from '../../../core/inventory/stock.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';

/**
 * One product's stock (prototype stock.html drawer): on hand per warehouse with its batches and expiry dates, and the
 * stock card, every movement in and out with the balance after it, newest first.
 */
@Component({
  selector: 'ms-stock-detail',
  imports: [TranslatePipe, DatePipe, DecimalPipe, Drawer, ProgressBar, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel],
  templateUrl: './stock-detail.html',
  styleUrl: './stock-detail.scss',
})
export class StockDetail {
  readonly row = input<StockRow | null>(null);
  readonly visible = model(false);

  protected readonly lang = inject(LangService);
  private readonly stock = inject(StockService);
  private readonly notify = inject(NotifyService);

  /** The row as a one-item list, for a block that is rebuilt when the product changes. */
  protected readonly current = computed(() => {
    const row = this.row();
    return row ? [row] : [];
  });
  protected readonly tab = signal<'warehouses' | 'card'>('warehouses');
  protected readonly detail = signal<ProductStock | null>(null);
  protected readonly movements = signal<MovementRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);

  constructor() {
    effect(() => {
      const row = this.row();
      if (this.visible() && row) {
        untracked(() => {
          this.tab.set('warehouses');
          this.detail.set(null);
          this.movements.set([]);
          this.stock.product(row.productId).subscribe({
            next: (d) => this.detail.set(d),
            error: (e) => this.notify.error(e),
          });
        });
      }
    });
  }

  protected loadMovements(event: TableLazyLoadEvent): void {
    const row = this.row();
    if (!row) {
      return;
    }
    const size = event.rows ?? 20;
    this.loading.set(true);
    this.stock
      .movements({ productId: row.productId, page: Math.floor((event.first ?? 0) / size), size, sort: 'at,desc' })
      .subscribe({
        next: (page) => {
          this.movements.set(page.content);
          this.total.set(page.totalElements);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.notify.error(e);
        },
      });
  }
}
