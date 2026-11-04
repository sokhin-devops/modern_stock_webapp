import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';

import { ApiService } from '../../../core/api/api.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { Delivered, SalesOrder } from '../orders/orders';

interface Row {
  id: number;
  productName: string;
  unitSymbol: string;
  ordered: number;
  delivered: number;
  left: number;
  qty: number | null;
}

/**
 * Deliver a sales order (FR-3.11): how much of each line goes now (everything still to deliver unless changed). The
 * stock leaves the order's warehouse and the delivery's invoice is made at the ordered prices.
 */
@Component({
  selector: 'ms-deliver-dialog',
  imports: [FormsModule, TranslatePipe, DecimalPipe, Dialog, InputNumber, InputText, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './deliver-dialog.html',
  styleUrl: '../../../shared/return-dialog.scss',
})
export class DeliverDialog {
  readonly order = input<SalesOrder | null>(null);
  readonly visible = model(false);
  readonly delivered = output<Delivered>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly rows = signal<Row[]>([]);
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly any = computed(() => this.rows().some((r) => (r.qty ?? 0) > 0));

  constructor() {
    effect(() => {
      if (this.visible()) {
        const o = this.order();
        untracked(() => {
          this.note.set('');
          this.rows.set(
            (o?.lines ?? []).map((l) => {
              const left = Math.max(0, l.qtyOrdered - l.qtyDelivered);
              return { id: l.id, productName: l.productName, unitSymbol: l.unitSymbol, ordered: l.qtyOrdered, delivered: l.qtyDelivered, left, qty: left || null };
            }),
          );
        });
      }
    });
  }

  protected setQty(i: number, qty: number | null): void {
    this.rows.update((rows) => rows.map((r, n) => (n === i ? { ...r, qty } : r)));
  }

  protected submit(): void {
    const o = this.order();
    const lines = this.rows().filter((r) => (r.qty ?? 0) > 0).map((r) => ({ salesOrderItemId: r.id, qty: r.qty }));
    if (!o || !lines.length) {
      return;
    }
    this.busy.set(true);
    this.api.post<Delivered>(`/sales-orders/${o.id}/deliver`, { lines, note: this.note().trim() || null }).subscribe({
      next: (d) => {
        this.busy.set(false);
        this.notify.showKey('orders.delivered', { delivery: d.deliveryNumber, invoice: d.invoiceNumber });
        this.delivered.emit(d);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
