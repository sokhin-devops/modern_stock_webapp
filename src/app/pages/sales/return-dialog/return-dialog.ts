import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { FieldLabel } from '../../../shared/field-label/field-label';

interface ReturnableLine {
  saleItemId: number;
  productName: string;
  unitSymbol: string;
  sold: number;
  returned: number;
  returnable: number;
  unitRefund: number;
  trackExpiry: boolean;
}

interface Returnable {
  number: string;
  customerId: number | null;
  customerName: string | null;
  invoiceOpen: number | null;
  lines: ReturnableLine[];
}

/** One line of the return being filled in. */
interface Row extends ReturnableLine {
  qty: number | null;
  condition: 'GOOD' | 'DAMAGED';
  expiry: Date | null;
}

export interface ReturnSaved {
  id: number;
  number: string;
  status: 'WAITING_APPROVAL' | 'POSTED' | 'REJECTED' | 'VOID';
  total: number;
  creditNote: { number: string; left: number; refundedAmount: number; usedAmount: number } | null;
}

/**
 * Take goods back from a sales receipt or an invoice (FR-3.12): how many of each line come back, in good shape (back
 * to stock) or damaged (a loss), and why. The money is the lines' share of the sale; on an invoice it lowers what is
 * still owed first, then it is refunded now or kept as the customer's credit. A walk-in customer is refunded at once.
 * A Cashier only asks for it (section 5): it waits for someone who may void sales, and nothing moves until then.
 */
@Component({
  selector: 'ms-return-dialog',
  imports: [
    FormsModule, TranslatePipe, CurrencyPipe, DecimalPipe, Dialog, InputNumber, InputText, SelectButton, ToggleSwitch, DatePicker,
    ButtonDirective, ButtonLabel, FieldLabel,
  ],
  templateUrl: './return-dialog.html',
  styleUrl: '../../../shared/return-dialog.scss',
})
export class ReturnDialog {
  /** Where the goods come from: one of the two. */
  readonly receiptId = input<number | null>(null);
  readonly invoiceId = input<number | null>(null);
  readonly visible = model(false);
  readonly saved = output<ReturnSaved>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly business = inject(BusinessService);

  /** Posted at once; otherwise sent for approval. */
  protected readonly canPost = computed(() => this.business.can('sale:void'));
  protected readonly source = signal<Returnable | null>(null);
  protected readonly rows = signal<Row[]>([]);
  protected readonly reason = signal('');
  protected readonly refundNow = signal(false);
  protected readonly method = signal<'CASH' | 'KHQR' | 'BANK'>('CASH');
  protected readonly currency = signal<'USD' | 'KHR'>('USD');
  protected readonly busy = signal(false);

  protected readonly conditions = [
    { value: 'GOOD', label: 'returns.good' },
    { value: 'DAMAGED', label: 'returns.damaged' },
  ];
  protected readonly methods = [
    { value: 'CASH', label: 'pos.cash' },
    { value: 'KHQR', label: 'pos.khqr' },
    { value: 'BANK', label: 'pos.bank' },
  ];
  protected readonly currencies = [
    { value: 'USD', label: 'USD' },
    { value: 'KHR', label: 'KHR' },
  ];

  protected readonly walkIn = computed(() => this.source() !== null && this.source()!.customerId === null);
  protected readonly total = computed(() =>
    Math.round(this.rows().reduce((sum, r) => sum + (r.qty ?? 0) * r.unitRefund, 0) * 100) / 100,
  );
  /** What goes on the invoice first, then what is left for a refund or credit. */
  protected readonly onInvoice = computed(() => Math.min(this.total(), this.source()?.invoiceOpen ?? 0));
  protected readonly left = computed(() => Math.round((this.total() - this.onInvoice()) * 100) / 100);
  protected readonly missingExpiry = computed(() =>
    this.rows().some((r) => (r.qty ?? 0) > 0 && r.condition === 'GOOD' && r.trackExpiry && !r.expiry),
  );

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => this.load());
      }
    });
  }

  protected setRow(i: number, patch: Partial<Row>): void {
    this.rows.update((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }

  protected submit(): void {
    const lines = this.rows()
      .filter((r) => (r.qty ?? 0) > 0)
      .map((r) => ({ saleItemId: r.saleItemId, qty: r.qty, condition: r.condition, expiryDate: toIsoDate(r.expiry) }));
    if (!lines.length || this.missingExpiry()) {
      return;
    }
    const refund = this.walkIn() || (this.refundNow() && this.left() > 0) ? { method: this.method(), currency: this.currency() } : null;
    this.busy.set(true);
    this.api.post<ReturnSaved>('/sales-returns', {
      salesReceiptId: this.receiptId(),
      invoiceId: this.invoiceId(),
      lines,
      reason: this.reason().trim() || null,
      refund,
    }).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r.status === 'WAITING_APPROVAL') {
          this.notify.showKey('returns.requested', { number: r.number });
        } else {
          this.notify.showKey('returns.saved', { number: r.number, credit: r.creditNote?.number ?? '' });
        }
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
    const path = this.receiptId() ? `/sales-receipts/${this.receiptId()}/returnable` : `/invoices/${this.invoiceId()}/returnable`;
    this.api.get<Returnable>(path).subscribe({
      next: (s) => {
        this.source.set(s);
        this.rows.set(s.lines.map((l) => ({ ...l, qty: null, condition: 'GOOD', expiry: null })));
      },
      error: (e) => {
        this.notify.error(e);
        this.visible.set(false);
      },
    });
  }
}
