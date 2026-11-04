import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ToggleButton } from 'primeng/togglebutton';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { StockRow } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { StockService } from '../../../core/inventory/stock.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { StockDetail } from '../stock-detail/stock-detail';

/**
 * Stock (prototype stock.html, PLAIN.md 11.2): on hand per product for the branch in the top bar, with search, a
 * category filter and "low stock only". A product opens its stock per warehouse and its stock card in a drawer.
 */
@Component({
  selector: 'ms-stock-page',
  imports: [
    FormsModule, TranslatePipe, CurrencyPipe, DecimalPipe, TableModule, IconField, InputIcon, InputText, Select,
    ToggleButton, StockDetail,
  ],
  templateUrl: './stock-page.html',
  styleUrl: './stock-page.scss',
})
export class StockPage {
  protected readonly lang = inject(LangService);
  private readonly business = inject(BusinessService);
  private readonly catalog = inject(CatalogService);
  private readonly stock = inject(StockService);
  private readonly notify = inject(NotifyService);

  protected readonly rows = signal<StockRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly q = signal('');
  protected readonly categoryId = signal<number | null>(null);
  /** Low stock comes as one list from the API, so the table pages it itself. */
  protected readonly onlyLow = signal(false);
  private last: TableLazyLoadEvent = { first: 0, rows: 20 };
  private readonly search = new Subject<string>();

  protected readonly categoryOptions = computed(() =>
    this.catalog.categories().map((c) => ({ value: c.id, label: this.lang.name(c.nameEn, c.nameKm) })),
  );
  /** The value column shows only for members who may see costs. */
  protected readonly showValue = computed(() => this.rows().some((r) => r.value != null));

  protected readonly detailOpen = signal(false);
  protected readonly selected = signal<StockRow | null>(null);

  constructor() {
    this.catalog.loadLists();
    this.search
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((q) => {
        this.q.set(q.trim());
        this.reload();
      });
    let firstRun = true;
    effect(() => {
      this.business.businessId();
      this.business.branchId();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => this.reload());
    });
  }

  protected load(event: TableLazyLoadEvent): void {
    this.last = event;
    if (this.onlyLow()) {
      this.loadLow();
      return;
    }
    const size = event.rows ?? 20;
    const sortField = typeof event.sortField === 'string' ? event.sortField : null;
    this.loading.set(true);
    this.stock
      .levels({
        page: Math.floor((event.first ?? 0) / size),
        size,
        sort: sortField ? `${sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : undefined,
        q: this.q(),
        categoryId: this.categoryId(),
      })
      .subscribe({
        next: (page) => {
          this.rows.set(page.content);
          this.total.set(page.totalElements);
          this.loading.set(false);
        },
        error: (e) => this.fail(e),
      });
  }

  protected onSearch(value: string): void {
    this.search.next(value);
  }

  protected setCategory(id: number | null): void {
    this.categoryId.set(id);
    this.reload();
  }

  protected setOnlyLow(value: boolean): void {
    this.onlyLow.set(value);
    this.reload();
  }

  protected open(row: StockRow): void {
    this.selected.set(row);
    this.detailOpen.set(true);
  }

  private reload(): void {
    this.first.set(0);
    this.load({ ...this.last, first: 0 });
  }

  /** Low stock: the whole list, filtered by the search text here. */
  private loadLow(): void {
    this.loading.set(true);
    this.stock.low().subscribe({
      next: (list) => {
        const q = this.q().toLowerCase();
        const rows = q
          ? list.filter((r) => [r.nameEn, r.nameKm ?? '', r.sku].some((text) => text.toLowerCase().includes(q)))
          : list;
        this.rows.set(rows);
        this.total.set(rows.length);
        this.loading.set(false);
      },
      error: (e) => this.fail(e),
    });
  }

  private fail(error: unknown): void {
    this.loading.set(false);
    this.notify.error(error);
  }
}
