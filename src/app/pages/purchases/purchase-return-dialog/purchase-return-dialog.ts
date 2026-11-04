import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';

interface ReturnableLine {
  goodsReceiptItemId: number;
  productName: string;
  unitSymbol: string;
  received: number;
  returnable: number;
  unitCost: number;
  batchNo: string | null;
  expiryDate: string | null;
}

interface Returnable {
  number: string;
  supplierName: string;
  billOpen: number | null;
  lines: ReturnableLine[];
}

/** One line of the return being filled in. */
interface Row extends ReturnableLine {
  qty: number | null;
}

export interface PurchaseReturnSaved {
  number: string;
  total: number;
  credit: { number: string; left: number } | null;
}

/**
 * Send goods back to the supplier from a goods receipt (FR-2.7): how many of each line go back, and why. They leave
 * stock from the batch they came in with. Their value at the received price is a supplier credit: it lowers the
 * receipt's bill first, then the supplier pays it back now or it stays for their next bills.
 */
@Component({
  selector: 'ms-purchase-return-dialog',
  imports: [
    FormsModule, TranslatePipe, CurrencyPipe, DecimalPipe, DatePipe, Dialog, InputNumber, InputText, SelectButton, ToggleSwitch,
    ButtonDirective, ButtonLabel, FieldLabel,
  ],
  templateUrl: './purchase-return-dialog.html',
  styleUrl: '../../../shared/return-dialog.scss',
})
export class PurchaseReturnDialog {
  readonly receiptId = input<number | null>(null);
  readonly visible = model(false);
  readonly saved = output<PurchaseReturnSaved>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly source = signal<Returnable | null>(null);
  protected readonly rows = signal<Row[]>([]);
  protected readonly reason = signal('');
  protected readonly refundNow = signal(false);
  protected readonly method = signal<'CASH' | 'KHQR' | 'BANK'>('CASH');
  protected readonly currency = signal<'USD' | 'KHR'>('USD');
  protected readonly busy = signal(false);

  protected readonly methods = [
    { value: 'CASH', label: 'pos.cash' },
    { value: 'KHQR', label: 'pos.khqr' },
    { value: 'BANK', label: 'pos.bank' },
  ];
  protected readonly currencies = [
    { value: 'USD', label: 'USD' },
    { value: 'KHR', label: 'KHR' },
  ];

  protected readonly total = computed(() =>
    Math.round(this.rows().reduce((sum, r) => sum + (r.qty ?? 0) * r.unitCost, 0) * 100) / 100,
  );
  /** What comes off the bill first, then what is left as credit or paid back. */
  protected readonly onBill = computed(() => Math.min(this.total(), this.source()?.billOpen ?? 0));
  protected readonly left = computed(() => Math.round((this.total() - this.onBill()) * 100) / 100);

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => this.load());
      }
    });
  }

  protected setQty(i: number, qty: number | null): void {
    this.rows.update((rows) => rows.map((r, n) => (n === i ? { ...r, qty } : r)));
  }

  protected submit(): void {
    const lines = this.rows()
      .filter((r) => (r.qty ?? 0) > 0)
      .map((r) => ({ goodsReceiptItemId: r.goodsReceiptItemId, qty: r.qty }));
    if (!lines.length) {
      return;
    }
    const refund = this.refundNow() && this.left() > 0 ? { method: this.method(), currency: this.currency() } : null;
    this.busy.set(true);
    this.api.post<PurchaseReturnSaved>('/purchase-returns', {
      goodsReceiptId: this.receiptId(),
      lines,
      reason: this.reason().trim() || null,
      refund,
    }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.notify.showKey('purchaseReturns.saved', { number: r.number, credit: r.credit?.number ?? '' });
        this.saved.emit(r);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  private load(): void {
    this.source.set(null);
    this.rows.set([]);
    this.reason.set('');
    this.refundNow.set(false);
    this.api.get<Returnable>(`/goods-receipts/${this.receiptId()}/returnable`).subscribe({
      next: (s) => {
        this.source.set(s);
        this.rows.set(s.lines.map((l) => ({ ...l, qty: null })));
      },
      error: (e) => {
        this.notify.error(e);
        this.visible.set(false);
      },
    });
  }
}
