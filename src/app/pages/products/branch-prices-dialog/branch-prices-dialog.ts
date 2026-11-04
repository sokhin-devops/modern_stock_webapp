import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';

import { ApiService } from '../../../core/api/api.service';
import { Product } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';

interface BranchPrice {
  branchId: number;
  unitId: number;
  sellPrice: number;
}

interface UnitColumn {
  unitId: number;
  symbol: string;
  /** The price everywhere else: the unit's own price, or the base price × its factor. */
  defaultPrice: number;
}

/**
 * Prices of one product per branch (FR-1.5): a branch may sell a unit at its own price; left empty, it sells at the
 * default. The POS, quotations and orders of that branch use it.
 */
@Component({
  selector: 'ms-branch-prices-dialog',
  imports: [FormsModule, TranslatePipe, CurrencyPipe, Dialog, InputNumber, ButtonDirective, ButtonLabel],
  templateUrl: './branch-prices-dialog.html',
  styleUrl: './branch-prices-dialog.scss',
})
export class BranchPricesDialog {
  readonly product = input<Product | null>(null);
  readonly visible = model(false);

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly branches = computed(() => this.business.branches().filter((b) => b.active));
  protected readonly units = computed<UnitColumn[]>(() => {
    const p = this.product();
    if (!p) {
      return [];
    }
    return [
      { unitId: p.baseUnitId, symbol: p.baseUnitSymbol, defaultPrice: p.sellPrice },
      ...p.units.map((u) => ({ unitId: u.unitId, symbol: u.unitSymbol ?? '', defaultPrice: u.sellPrice ?? round2(p.sellPrice * u.factor) })),
    ];
  });
  /** branchId-unitId → the branch's own price (null = the default). */
  protected readonly prices = signal<Record<string, number | null>>({});
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const p = this.product();
      if (this.visible() && p) {
        untracked(() => this.load(p.id));
      }
    });
  }

  protected key(branchId: number, unitId: number): string {
    return `${branchId}-${unitId}`;
  }

  protected set(branchId: number, unitId: number, price: number | null): void {
    this.prices.update((all) => ({ ...all, [this.key(branchId, unitId)]: price }));
  }

  protected save(): void {
    const p = this.product();
    if (!p) {
      return;
    }
    const body = this.branches().flatMap((b) =>
      this.units().map((u) => ({ branchId: b.id, unitId: u.unitId, sellPrice: this.prices()[this.key(b.id, u.unitId)] ?? null })),
    );
    this.busy.set(true);
    this.api.put(`/products/${p.id}/branch-prices`, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey('products.branchPricesSaved');
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  private load(productId: number): void {
    this.prices.set({});
    this.api.get<BranchPrice[]>(`/products/${productId}/branch-prices`).subscribe({
      next: (list) => this.prices.set(Object.fromEntries(list.map((bp) => [this.key(bp.branchId, bp.unitId), bp.sellPrice]))),
      error: (e) => this.notify.error(e),
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
