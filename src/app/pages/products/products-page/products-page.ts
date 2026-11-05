import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ToggleButton } from 'primeng/togglebutton';
import { Tooltip } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { Category, Product, Unit } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { ApiFilePipe } from '../../../shared/api-file.pipe';
import { BranchPricesDialog } from '../branch-prices-dialog/branch-prices-dialog';
import { CategoryDialog } from '../category-dialog/category-dialog';
import { ProductForm } from '../product-form/product-form';
import { LabelsDialog } from '../labels-dialog/labels-dialog';
import { ReorderLevelsDialog } from '../reorder-levels-dialog/reorder-levels-dialog';
import { UnitDialog } from '../unit-dialog/unit-dialog';

type ProductTab = 'products' | 'categories' | 'units';

/**
 * Products (prototype products.html, PLAIN.md 11.1): the product list with search and a category filter, page by page
 * from the API, and the categories and units in their own tabs. A product opens in a dialog over the list.
 */
@Component({
  selector: 'ms-products-page',
  imports: [
    FormsModule, TranslatePipe, CurrencyPipe, DecimalPipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, IconField,
    InputIcon, InputText, Select, ToggleButton, ButtonDirective, ButtonIcon, ButtonLabel, ProductForm, CategoryDialog,
    UnitDialog, Tooltip, ApiFilePipe, BranchPricesDialog, ReorderLevelsDialog, LabelsDialog,
  ],
  templateUrl: './products-page.html',
  styleUrl: './products-page.scss',
})
export class ProductsPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly translate = inject(TranslateService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly tab = signal<ProductTab>('products');
  /** Barcode labels to print (FR-1.9). */
  protected readonly labelsOpen = signal(false);
  /** Own prices per branch (FR-1.5): only worth showing with more than one branch. */
  protected readonly canBranchPrices = computed(
    () => this.business.can('branch_price:manage') && this.business.branches().filter((b) => b.active).length > 1,
  );
  protected readonly pricing = signal<Product | null>(null);
  protected readonly pricesOpen = signal(false);
  /** Own reorder level per branch (FR-4.7), for members who manage products. */
  protected readonly canBranchReorder = computed(
    () => this.business.can('product:manage') && this.business.branches().filter((b) => b.active).length > 1,
  );
  protected readonly showActions = computed(() => this.canBranchPrices() || this.canBranchReorder());
  protected readonly reorderOpen = signal(false);
  protected readonly canManage = computed(() => this.business.can('product:manage'));

  // Product list: one page at a time from the API.
  protected readonly rows = signal<Product[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);
  protected readonly q = signal('');
  protected readonly categoryId = signal<number | null>(null);
  protected readonly showInactive = signal(false);
  private last: TableLazyLoadEvent = { first: 0, rows: 20 };
  private readonly search = new Subject<string>();

  protected readonly categoryOptions = computed(() =>
    this.catalog.categories().map((c) => ({ value: c.id, label: this.lang.name(c.nameEn, c.nameKm) })),
  );

  // Drawers and dialogs
  protected readonly productOpen = signal(false);
  protected readonly editing = signal<Product | null>(null);
  protected readonly categoryOpen = signal(false);
  protected readonly editingCategory = signal<Category | null>(null);
  protected readonly unitOpen = signal(false);
  protected readonly editingUnit = signal<Unit | null>(null);

  constructor() {
    this.catalog.loadLists();
    this.search
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((q) => {
        this.q.set(q.trim());
        this.reload();
      });
    // Stock on hand depends on the business and branch: reload when either changes (the table loads the first page).
    let firstRun = true;
    effect(() => {
      this.business.businessId();
      this.business.branchId();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => {
        this.catalog.loadLists(true);
        this.reload();
      });
    });
  }

  protected load(event: TableLazyLoadEvent): void {
    this.last = event;
    const size = event.rows ?? 20;
    const sortField = typeof event.sortField === 'string' ? event.sortField : null;
    this.loading.set(true);
    this.catalog
      .searchProducts({
        page: Math.floor((event.first ?? 0) / size),
        size,
        sort: sortField ? `${sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : undefined,
        q: this.q(),
        categoryId: this.categoryId(),
        active: !this.showInactive(),
      })
      .subscribe({
        next: (page) => {
          this.rows.set(page.content);
          this.total.set(page.totalElements);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.notify.error(e);
        },
      });
  }

  protected onSearch(value: string): void {
    this.search.next(value);
  }

  protected setCategory(id: number | null): void {
    this.categoryId.set(id);
    this.reload();
  }

  protected setInactive(value: boolean): void {
    this.showInactive.set(value);
    this.reload();
  }

  /** Back to the first page with the current filters. */
  protected reload(): void {
    this.first.set(0);
    this.load({ ...this.last, first: 0 });
  }

  protected openProduct(product: Product | null): void {
    this.editing.set(product);
    this.productOpen.set(true);
  }

  /** After a save the row is updated in place; a new product shows at the top until the next reload. */
  protected onSaved(product: Product): void {
    if (this.showInactive() !== !product.active) {
      this.reload();
      return;
    }
    const index = this.rows().findIndex((p) => p.id === product.id);
    if (index >= 0) {
      this.rows.update((list) => list.map((p) => (p.id === product.id ? product : p)));
    } else {
      this.rows.update((list) => [product, ...list]);
      this.total.update((n) => n + 1);
    }
  }

  /** Stock status shown as a tag: deactivated, out of stock, low (at or below the reorder level), or in stock. */
  protected status(p: Product): { key: string; tone: string } {
    if (!p.active) {
      return { key: 'products.inactive', tone: '' };
    }
    if (p.qtyOnHand <= 0) {
      return { key: 'products.out', tone: 'tag-danger' };
    }
    if (p.reorderAt > 0 && p.qtyOnHand <= p.reorderAt) {
      return { key: 'products.low', tone: 'tag-primary' };
    }
    return { key: 'products.inStock', tone: '' };
  }

  protected categoryLabel(id: number | null): string {
    return id == null ? '' : (this.catalog.categoryName().get(id) ?? '');
  }

  protected openCategory(category: Category | null): void {
    this.editingCategory.set(category);
    this.categoryOpen.set(true);
  }

  protected deleteCategory(category: Category): void {
    this.ask('products.deleteCategoryConfirm', this.lang.name(category.nameEn, category.nameKm), () =>
      this.catalog.deleteCategory(category.id).subscribe({
        next: () => this.notify.showKey('common.deleted'),
        error: (e) => this.notify.error(e),
      }),
    );
  }

  protected openUnit(unit: Unit | null): void {
    this.editingUnit.set(unit);
    this.unitOpen.set(true);
  }

  protected deleteUnit(unit: Unit): void {
    this.ask('products.deleteUnitConfirm', this.lang.name(unit.nameEn, unit.nameKm), () =>
      this.catalog.deleteUnit(unit.id).subscribe({
        next: () => this.notify.showKey('common.deleted'),
        error: (e) => this.notify.error(e),
      }),
    );
  }

  private ask(messageKey: string, name: string, accept: () => void): void {
    this.confirm.confirm({
      header: this.translate.instant('common.delete'),
      message: this.translate.instant(messageKey, { name }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept,
    });
  }
}
