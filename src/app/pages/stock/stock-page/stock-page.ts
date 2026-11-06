import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ToggleButton } from 'primeng/togglebutton';
import { Tooltip } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { BranchQty, BranchStockRow, StockRow } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { StockService } from '../../../core/inventory/stock.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { ReorderLevelsDialog, ReorderTarget } from '../../products/reorder-levels-dialog/reorder-levels-dialog';
import { StockDetail } from '../stock-detail/stock-detail';
import { warehouseOptions } from '../../../shared/options';
import { exportList } from '../../../shared/list-export';

/**
 * Stock (prototype stock.html, PLAIN.md 11.2): on hand per product for the branch in the top bar, with search, a
 * category filter and "low stock only". A product opens its stock per warehouse and its stock card in a dialog.
 * "By branch" puts every branch side by side with its own reorder level (FR-4.7, FR-4.8).
 */
@Component({
  selector: 'ms-stock-page',
  imports: [
    FormsModule, TranslatePipe, CurrencyPipe, DecimalPipe, TableModule, IconField, InputIcon, InputText, Select,
    ToggleButton, SelectButton, ButtonDirective, ButtonIcon, ButtonLabel, Tooltip, StockDetail, ReorderLevelsDialog,
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
  private readonly translate = inject(TranslateService);

  protected readonly rows = signal<StockRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly q = signal('');
  protected readonly categoryId = signal<number | null>(null);
  /** One warehouse's stock (PLAIN.md 12.2), or every warehouse of the branch picked in the top bar. */
  protected readonly warehouseId = signal<number | null>(null);
  protected readonly warehouseChoices = computed(() =>
    warehouseOptions(this.business.pickableBranches(), this.lang, this.business.branchId()),
  );
  protected readonly exporting = signal(false);
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

  /** Side by side needs a member who may use more than one branch. */
  protected readonly canByBranch = computed(
    () => this.business.canPickBranch() && this.business.branches().filter((b) => b.active).length > 1,
  );
  protected readonly view = signal<'list' | 'branches'>('list');
  protected readonly byBranch = computed(() => this.view() === 'branches' && this.canByBranch());
  protected readonly views = [
    { label: 'stock.viewList', value: 'list' },
    { label: 'stock.viewByBranch', value: 'branches' },
  ];
  /** The columns, in the API's order: main branch first. */
  protected readonly branchColumns = computed(() =>
    this.business
      .branches()
      .filter((b) => b.active)
      .sort((a, b) => Number(b.main) - Number(a.main) || a.id - b.id),
  );
  protected readonly branchRows = signal<BranchStockRow[]>([]);
  protected readonly canReorder = computed(() => this.business.can('product:manage'));
  protected readonly reorderFor = signal<ReorderTarget | null>(null);
  protected readonly reorderOpen = signal(false);

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
    if (this.byBranch()) {
      this.loadByBranch(event);
      return;
    }
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
        warehouseId: this.warehouseId(),
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

  protected setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    this.reload();
  }

  /** Every product of the list (search, category, warehouse) as an Excel file. */
  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    this.exporting.set(true);
    try {
      await exportList<StockRow>(
        (page, size) => this.stock.levels({ page, size, sort: 'nameEn,asc', q: this.q(), categoryId: this.categoryId(), warehouseId: this.warehouseId() }),
        [
          { header: 'SKU', value: (r) => r.sku },
          { header: t('products.colProduct'), value: (r) => this.lang.name(r.nameEn, r.nameKm) },
          { header: t('stock.onHand'), value: (r) => r.qtyOnHand },
          { header: t('stock.unit'), value: (r) => r.unitSymbol },
          { header: t('stock.reserved'), value: (r) => r.reserved || null },
          { header: t('stock.reorderAt'), value: (r) => r.reorderLevel },
          ...(this.showValue() ? [{ header: t('stock.value'), value: (r: StockRow) => r.value, format: '#,##0.00' }] : []),
        ],
        'stock',
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  protected setCategory(id: number | null): void {
    this.categoryId.set(id);
    this.reload();
  }

  protected setOnlyLow(value: boolean): void {
    this.onlyLow.set(value);
    this.reload();
  }

  /** The new table loads its first page itself. */
  protected setView(view: 'list' | 'branches'): void {
    this.first.set(0);
    this.last = { ...this.last, first: 0 };
    this.view.set(view);
  }

  protected cell(row: BranchStockRow, branchId: number): BranchQty | undefined {
    return row.branches.find((c) => c.branchId === branchId);
  }

  protected editLevels(row: BranchStockRow): void {
    this.reorderFor.set({ id: row.productId, nameEn: row.nameEn, nameKm: row.nameKm });
    this.reorderOpen.set(true);
  }

  protected reloadPage(): void {
    this.load(this.last);
  }

  protected open(row: StockRow): void {
    this.selected.set(row);
    this.detailOpen.set(true);
  }

  private reload(): void {
    this.first.set(0);
    this.load({ ...this.last, first: 0 });
  }

  private loadByBranch(event: TableLazyLoadEvent): void {
    const size = event.rows ?? 20;
    const sortField = typeof event.sortField === 'string' ? event.sortField : null;
    this.loading.set(true);
    this.stock
      .byBranch({
        page: Math.floor((event.first ?? 0) / size),
        size,
        sort: sortField ? `${sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : undefined,
        q: this.q(),
        categoryId: this.categoryId(),
        lowOnly: this.onlyLow(),
      })
      .subscribe({
        next: (page) => {
          this.branchRows.set(page.content);
          this.total.set(page.totalElements);
          this.loading.set(false);
        },
        error: (e) => this.fail(e),
      });
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
