import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tooltip } from 'primeng/tooltip';

import { Product } from '../../core/api/models';
import { CatalogService } from '../../core/catalog/catalog.service';
import { LangService } from '../../core/lang.service';
import { PickField } from '../pick/pick';

/**
 * One line of a document: a product in one of its units, a quantity, and (receiving) cost, batch and expiry, or (selling)
 * a line discount.
 */
export interface DocLine {
  product: Product | null;
  /** null = the stock unit. */
  unitId: number | null;
  qty: number | null;
  unitCost: number | null;
  batchNo: string;
  expiryDate: Date | null;
  /** Line discount in USD (sales documents). */
  discount?: number | null;
}

export function emptyLine(): DocLine {
  return { product: null, unitId: null, qty: null, unitCost: null, batchNo: '', expiryDate: null };
}

/**
 * The product lines of an adjustment, transfer or purchase (prototype document lines, UX_UI.md): the product is picked
 * inside the line by name, SKU or barcode; then unit, quantity and, when asked for, cost, batch and expiry.
 */
@Component({
  selector: 'ms-lines-editor',
  imports: [FormsModule, TranslatePipe, DecimalPipe, PickField, Select, InputNumber, InputText, DatePicker, ButtonDirective, ButtonIcon, Tooltip],
  templateUrl: './lines-editor.html',
  styleUrl: './lines-editor.scss',
})
export class LinesEditor {
  readonly lines = model<DocLine[]>([emptyLine()]);
  /** Show the unit cost (purchases, stock coming in). */
  readonly showCost = input(false);
  /** Show batch and expiry (receiving products that track expiry). */
  readonly showBatch = input(false);
  /** Sales documents: the price (set by the API, see prices), a line discount and the amount. */
  readonly showPrice = input(false);
  /** The unit price of each line as the API priced it (same order as lines; null while unknown). */
  readonly prices = input<(number | null)[]>([]);
  /** Quantities may be negative (adjustments take stock out). */
  readonly allowNegative = input(false);
  readonly disabled = input(false);

  private readonly catalog = inject(CatalogService);
  protected readonly lang = inject(LangService);
  /** A picked product shows its name in the member's language. */
  protected readonly productName = (p: Product): string => this.lang.name(p.nameEn, p.nameKm);

  protected readonly total = computed(() =>
    this.lines().reduce((sum, l) => sum + (l.qty ?? 0) * (l.unitCost ?? 0), 0),
  );

  protected amount(index: number, line: DocLine): number | null {
    const price = this.prices()[index];
    return price == null || !line.qty ? null : Math.round((price * line.qty - (line.discount ?? 0)) * 100) / 100;
  }

  protected label(p: Product): string {
    return `${this.lang.name(p.nameEn, p.nameKm)} · ${p.sku}`;
  }

  protected unitOptions(p: Product | null): { value: number | null; label: string }[] {
    if (!p) {
      return [];
    }
    return [{ value: null, label: p.baseUnitSymbol }, ...p.units.map((u) => ({ value: u.unitId, label: u.unitSymbol ?? '' }))];
  }

  protected update(index: number, change: Partial<DocLine>): void {
    this.lines.update((list) => {
      const next = list.map((l, i) => (i === index ? { ...l, ...change } : l));
      // A new empty line appears after the last one is filled.
      if (index === next.length - 1 && next[index].product) {
        next.push(emptyLine());
      }
      return next;
    });
  }

  protected pick(index: number, product: Product | null): void {
    if (!product || typeof product !== 'object') {
      return;
    }
    this.update(index, { product, unitId: null, qty: this.lines()[index].qty ?? 1, unitCost: this.lines()[index].unitCost ?? product.avgCost ?? null });
  }

  protected remove(index: number): void {
    this.lines.update((list) => {
      const next = list.filter((_, i) => i !== index);
      return next.length ? next : [emptyLine()];
    });
  }
}
