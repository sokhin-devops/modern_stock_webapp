import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../core/api/api.service';
import { BusinessService } from '../../core/business/business.service';
import { NotifyService } from '../../core/notify.service';

/** A sales return (customer) or a purchase return (supplier), as the API sends it. */
export interface ReturnDoc {
  id: number;
  number: string;
  status: 'WAITING_APPROVAL' | 'POSTED' | 'REJECTED' | 'VOID';
  returnedAt: string;
  total: number;
  reason: string | null;
  /** Who made it: for one waiting, the Cashier who asked or the Stock keeper who prepared it. */
  createdByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  // A sales return
  saleNumber?: string | null;
  customerName?: string | null;
  lossValue?: number;
  refund?: { method: string; currency: string } | null;
  creditNote?: { number: string } | null;
  // A purchase return
  goodsReceiptNumber?: string | null;
  supplierName?: string;
  credit?: { number: string } | null;
  lines: {
    productName: string;
    unitSymbol: string;
    qty: number;
    condition?: 'GOOD' | 'DAMAGED';
    refund?: number;
    amount?: number;
    batchNo?: string | null;
  }[];
}

/**
 * One return: what came back (or goes back), for how much, and who made it. One that waits (a Cashier's request or a
 * Stock keeper's prepared return, PLAIN.md section 5) is approved or rejected here by whoever may post returns.
 */
@Component({
  selector: 'ms-return-details',
  imports: [TranslatePipe, CurrencyPipe, DatePipe, DecimalPipe, Dialog, TableModule, ButtonDirective, ButtonLabel],
  templateUrl: './return-details.html',
  styleUrl: './return-details.scss',
})
export class ReturnDetails {
  readonly kind = input.required<'customer' | 'supplier'>();
  readonly doc = model<ReturnDoc | null>(null);
  readonly changed = output<ReturnDoc>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly business = inject(BusinessService);

  protected readonly busy = signal(false);
  protected readonly canDecide = computed(() => this.business.can(this.kind() === 'customer' ? 'sale:void' : 'bill:manage'));

  protected decide(r: ReturnDoc, action: 'approve' | 'reject'): void {
    const path = this.kind() === 'customer' ? 'sales-returns' : 'purchase-returns';
    this.busy.set(true);
    this.api.post<ReturnDoc>(`/${path}/${r.id}/${action}`).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.notify.showKey(action === 'approve' ? 'returns.approved' : 'returns.rejected', { number: updated.number });
        this.doc.set(updated);
        this.changed.emit(updated);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
