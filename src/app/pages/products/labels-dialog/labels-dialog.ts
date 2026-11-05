import { CurrencyPipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, model, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { Product } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { BarcodeSvg } from '../../../shared/barcode-svg/barcode-svg';
import { printCopy } from '../../../shared/print-copy';

interface LabelRow {
  product: Product;
  copies: number;
}

/** A sheet of 24 stickers (3 × 8 of 70 × 37 mm), the common A4 label paper. */
const PER_SHEET = 24;

/**
 * Barcode labels (FR-1.9): pick products and how many labels each, then print them on A4 sticker sheets with the
 * name, the price and the barcode. Goods without a barcode get an in-store one first (whoever manages products).
 */
@Component({
  selector: 'ms-labels-dialog',
  imports: [FormsModule, TranslatePipe, CurrencyPipe, Dialog, AutoComplete, InputNumber, ToggleSwitch, ButtonDirective, ButtonIcon, ButtonLabel, BarcodeSvg],
  templateUrl: './labels-dialog.html',
  styleUrl: './labels-dialog.scss',
})
export class LabelsDialog {
  readonly visible = model(false);

  private readonly api = inject(ApiService);
  private readonly catalog = inject(CatalogService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  protected readonly lang = inject(LangService);

  private readonly picker = viewChild<AutoComplete>('picker');
  private readonly paperEl = viewChild<ElementRef<HTMLElement>>('paper');

  protected readonly rows = signal<LabelRow[]>([]);
  protected readonly found = signal<Product[]>([]);
  protected readonly showPrice = signal(true);
  protected readonly busy = signal(false);
  protected readonly canManage = computed(() => this.business.can('product:manage'));
  protected readonly productName = (p: Product): string => this.lang.name(p.nameEn, p.nameKm);

  protected readonly missing = computed(() => this.rows().filter((r) => !r.product.barcode));
  /** One entry per sticker, products with a barcode only. */
  protected readonly labels = computed(() =>
    this.rows().filter((r) => r.product.barcode).flatMap((r) => Array.from({ length: Math.max(0, r.copies) }, () => r.product)),
  );
  /** The labels sheet by sheet, so each prints on its own page. */
  protected readonly sheets = computed(() => {
    const labels = this.labels();
    const sheets: Product[][] = [];
    for (let i = 0; i < labels.length; i += PER_SHEET) {
      sheets.push(labels.slice(i, i + PER_SHEET));
    }
    return sheets;
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => this.rows.set([]));
      }
    });
  }

  protected find(event: AutoCompleteCompleteEvent): void {
    this.catalog.searchProducts({ page: 0, size: 10, q: event.query.trim(), active: true }).subscribe({
      next: (page) => this.found.set(page.content),
    });
  }

  protected add(product: Product | null): void {
    if (!product?.id) {
      return;
    }
    if (!this.rows().some((r) => r.product.id === product.id)) {
      this.rows.update((rows) => [...rows, { product, copies: 1 }]);
    }
    // Ready for the next product
    this.picker()?.clear();
  }

  /** The goods that came without a barcode, one label each. */
  protected addMissing(): void {
    this.catalog.searchProducts({ page: 0, size: 200, active: true }).subscribe({
      next: (page) => {
        const have = new Set(this.rows().map((r) => r.product.id));
        const add = page.content.filter((p) => !p.barcode && !have.has(p.id)).map((product) => ({ product, copies: 1 }));
        this.rows.update((rows) => [...rows, ...add]);
        if (!add.length) {
          this.notify.showKey('labels.noneMissing');
        }
      },
      error: (e) => this.notify.error(e),
    });
  }

  protected setCopies(i: number, copies: number | null): void {
    this.rows.update((rows) => rows.map((r, n) => (n === i ? { ...r, copies: copies ?? 0 } : r)));
  }

  protected remove(i: number): void {
    this.rows.update((rows) => rows.filter((_, n) => n !== i));
  }

  protected giveBarcodes(): void {
    const ids = this.missing().map((r) => r.product.id);
    this.busy.set(true);
    this.api.post<Product[]>('/products/barcodes', { productIds: ids }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        const byId = new Map(updated.map((p) => [p.id, p]));
        this.rows.update((rows) => rows.map((r) => ({ ...r, product: byId.get(r.product.id) ?? r.product })));
        this.notify.showKey('labels.given', { n: ids.length });
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected print(): void {
    const el = this.paperEl()?.nativeElement;
    if (el) {
      printCopy(el);
    }
  }
}
