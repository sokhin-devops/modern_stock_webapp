import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { forkJoin } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { Product } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';

/** The product the dialog is for: a product row, or a row of the stock by branch view. */
export interface ReorderTarget {
  id: number;
  nameEn: string;
  nameKm: string | null;
}

interface BranchReorder {
  branchId: number;
  reorderLevel: number;
}

/**
 * Reorder level of one product per branch (FR-4.7): a branch may reorder at its own level; left empty, it uses the
 * product's. 0 stops watching the product in that branch. Low stock, alerts and the reorder report use them.
 */
@Component({
  selector: 'ms-reorder-levels-dialog',
  imports: [FormsModule, TranslatePipe, DecimalPipe, Dialog, InputNumber, ButtonDirective, ButtonLabel],
  templateUrl: './reorder-levels-dialog.html',
  styleUrl: '../branch-prices-dialog/branch-prices-dialog.scss',
})
export class ReorderLevelsDialog {
  readonly product = input<ReorderTarget | null>(null);
  readonly visible = model(false);
  readonly saved = output<void>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly branches = computed(() => this.business.branches().filter((b) => b.active));
  /** The product's own level and unit, loaded with the branch levels. */
  protected readonly loaded = signal<Product | null>(null);
  /** branchId → the branch's own level (null = the product's). */
  protected readonly levels = signal<Record<number, number | null>>({});
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const p = this.product();
      if (this.visible() && p) {
        untracked(() => this.load(p.id));
      }
    });
  }

  protected set(branchId: number, level: number | null): void {
    this.levels.update((all) => ({ ...all, [branchId]: level }));
  }

  protected save(): void {
    const p = this.product();
    if (!p) {
      return;
    }
    const body = this.branches().map((b) => ({ branchId: b.id, reorderLevel: this.levels()[b.id] ?? null }));
    this.busy.set(true);
    this.api.put(`/products/${p.id}/reorder-levels`, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey('products.branchReorderSaved');
        this.visible.set(false);
        this.saved.emit();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  private load(productId: number): void {
    this.loaded.set(null);
    this.levels.set({});
    forkJoin([
      this.api.get<Product>(`/products/${productId}`),
      this.api.get<BranchReorder[]>(`/products/${productId}/reorder-levels`),
    ]).subscribe({
      next: ([product, list]) => {
        this.loaded.set(product);
        this.levels.set(Object.fromEntries(list.map((r) => [r.branchId, r.reorderLevel])));
      },
      error: (e) => this.notify.error(e),
    });
  }
}
