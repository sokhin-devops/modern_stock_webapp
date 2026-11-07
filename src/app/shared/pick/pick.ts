import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, model, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { debounceTime, map, Observable, Subject, switchMap } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { Customer, PageResponse, Product, Supplier } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
import { CatalogService } from '../../core/catalog/catalog.service';
import { LangService } from '../../core/lang.service';
import { ProductForm } from '../../pages/products/product-form/product-form';
import { QuickPartyDialog } from '../quick-party-dialog/quick-party-dialog';

export type PickKind = 'customer' | 'supplier' | 'product';

/** A row of the list: the record itself, with the text shown and searched. */
type Row = Record<string, any> & { id: number; _label: string; _search: string; _none?: boolean };

/** How many rows a list shows before the search narrows it. */
const PAGE = 30;
const NONE_ID = -1;

/**
 * One picker for customers, suppliers and products (Improve.md 4-5): clicking opens the list straight away (the
 * first 30, by name), the search box at its top narrows it on the server (name, phone, SKU or barcode), and "+ New"
 * at its foot adds one without leaving the form (a name and a phone for a customer or supplier, the product form for
 * a product), then picks it. The value is the record itself (or a list of them with `multiple`), like the
 * autocompletes this replaces. `noneLabel` adds a first choice that stands for nobody (POS: "Walk-in customer").
 */
@Component({
  selector: 'ms-pick',
  imports: [FormsModule, TranslatePipe, DecimalPipe, NgTemplateOutlet, Select, MultiSelect, ButtonDirective, ButtonIcon, ButtonLabel, QuickPartyDialog, ProductForm],
  templateUrl: './pick.html',
  styleUrl: './pick.scss',
  host: { '[class.fluid]': 'fluid()' },
})
export class PickField {
  readonly kind = input.required<PickKind>();
  /** The picked record, null for none; with `multiple`, a list. */
  readonly value = model<any>(null);
  readonly multiple = input(false);
  readonly placeholder = input('');
  readonly inputId = input<string | undefined>(undefined);
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly showClear = input(false);
  readonly disabled = input(false);
  readonly fluid = input(true);
  readonly noneLabel = input<string | null>(null);
  /** Products only: leave out products that are switched off. */
  readonly activeOnly = input(false);
  /** Records not to offer (lines already on the document). */
  readonly exclude = input<number[]>([]);
  /** "+ New" at the foot of the list (when the member may add one). Off for filters. */
  readonly quickAdd = input(true);
  /** Fires when the member picks (not when the value is set from outside). */
  readonly picked = output<any>();

  private readonly api = inject(ApiService);
  private readonly catalog = inject(CatalogService);
  private readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);

  private readonly select = viewChild(Select);
  private readonly multi = viewChild(MultiSelect);

  private readonly found = signal<Row[]>([]);
  protected readonly loading = signal(false);
  /** More records match than the list shows: the search finds the rest. */
  protected readonly more = signal(false);
  private readonly query = signal('');
  private loadedOnce = false;
  private readonly search$ = new Subject<string>();

  protected readonly addOpen = signal(false);
  protected readonly typed = signal('');

  protected readonly canAdd = computed(() => {
    if (!this.quickAdd()) {
      return false;
    }
    switch (this.kind()) {
      case 'customer':
        return this.business.can('customer:manage') || this.business.can('customer:create_pos');
      case 'supplier':
        return this.business.can('supplier:manage');
      default:
        return this.business.can('product:manage');
    }
  });

  protected readonly addLabel = computed(
    () => ({ customer: 'partners.newCustomer', supplier: 'partners.newSupplier', product: 'products.new' })[this.kind()],
  );

  private readonly none = computed<Row | null>(() => {
    const label = this.noneLabel();
    return label ? { id: NONE_ID, _label: label, _search: label, _none: true } : null;
  });

  /** The list: "nobody" first, then the picked record(s) and what the server found, each once. */
  protected readonly options = computed<Row[]>(() => {
    this.lang.lang(); // labels follow the language
    const rows: Row[] = [];
    const seen = new Set<number>();
    const add = (r: Row) => {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        rows.push(r);
      }
    };
    // Always in the list, so the box can show it; while searching, the list's own filter hides it.
    const none = this.none();
    if (none) {
      add(none);
    }
    for (const v of this.selected()) {
      add(this.row(v));
    }
    const exclude = new Set(this.exclude());
    for (const r of this.found()) {
      if (!exclude.has(r.id)) {
        add(this.row(r));
      }
    }
    return rows;
  });

  /** What p-select / p-multiselect holds: the "nobody" row while nothing is picked. */
  protected readonly model = computed(() => {
    const v = this.value();
    if (this.multiple()) {
      return (v ?? []).map((x: any) => this.row(x));
    }
    return v ? this.row(v) : this.none();
  });

  private readonly selected = computed<any[]>(() => {
    const v = this.value();
    return this.multiple() ? (v ?? []) : v ? [v] : [];
  });

  constructor() {
    this.search$
      .pipe(
        debounceTime(250),
        switchMap((q) => {
          this.loading.set(true);
          return this.fetch(q);
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe({
        next: (page) => {
          this.loading.set(false);
          this.found.set(page.content as Row[]);
          this.more.set(page.totalElements > page.content.length);
        },
        error: () => this.loading.set(false),
      });
  }

  /** Opening the list loads the first records, once (and again after a search was cleared). */
  protected onShow(): void {
    if (!this.loadedOnce || this.query()) {
      this.loadedOnce = true;
      this.query.set('');
      this.loading.set(true);
      this.search$.next('');
    }
  }

  protected onFilter(text: string): void {
    const q = (text ?? '').trim();
    this.query.set(q);
    this.search$.next(q);
  }

  protected onPick(row: Row | null): void {
    const value = !row || row._none ? null : this.strip(row);
    this.value.set(value);
    this.picked.emit(value);
  }

  protected onPickMany(rows: Row[] | null): void {
    const value = (rows ?? []).map((r) => this.strip(r));
    this.value.set(value);
    this.picked.emit(value);
  }

  protected openAdd(): void {
    this.typed.set(this.query());
    this.select()?.hide();
    this.multi()?.hide();
    if (this.kind() === 'product') {
      this.catalog.loadLists();
    }
    this.addOpen.set(true);
  }

  /** A record added here is picked at once (added to the list for a multiple pick). */
  protected added(record: Customer | Supplier | Product): void {
    this.found.update((rows) => [record as unknown as Row, ...rows]);
    if (this.multiple()) {
      this.onPickMany([...this.selected().map((x) => this.row(x)), this.row(record)]);
    } else {
      this.onPick(this.row(record));
    }
  }

  protected productName(p: any): string {
    return this.lang.name(p.nameEn, p.nameKm);
  }

  private fetch(q: string): Observable<PageResponse<unknown>> {
    switch (this.kind()) {
      case 'customer':
        return this.api.page<Customer>('/customers', { page: 0, size: PAGE, sort: 'name,asc' }, { q });
      case 'supplier':
        return this.api.page<Supplier>('/suppliers', { page: 0, size: PAGE, sort: 'name,asc' }, { q });
      default:
        return this.catalog
          .searchProducts({ page: 0, size: PAGE, sort: 'nameEn,asc', q, active: this.activeOnly() ? true : undefined })
          .pipe(map((page) => (this.activeOnly() ? { ...page, content: page.content.filter((p) => p.active) } : page)));
    }
  }

  private row(r: any): Row {
    if (r._none) {
      return r;
    }
    if (this.kind() === 'product') {
      return { ...r, _label: this.productName(r), _search: [r.nameEn, r.nameKm, r.sku, r.barcode].filter(Boolean).join(' ') };
    }
    return { ...r, _label: r.name, _search: [r.name, r.phone].filter(Boolean).join(' ') };
  }

  /** The record without the picker's own fields. */
  private strip(row: Row): any {
    const { _label, _search, _none, ...record } = row;
    return record;
  }
}
