import { CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';

import { BusinessService } from '../../core/business/business.service';
import { VoidService } from '../../core/void.service';
import { AttachButton } from '../attach-button/attach-button';

/** A payment received from a customer or paid to a supplier, as the API sends it. */
export interface PaymentDoc {
  id: number;
  number: string;
  direction: 'IN' | 'OUT';
  partyName: string | null;
  method: string;
  currency: 'USD' | 'KHR';
  amount: number;
  exchangeRate: number;
  amountUsd: number;
  unallocatedUsd: number;
  reference: string | null;
  paidAt: string;
  status: 'POSTED' | 'VOID';
  allocations: { toType: 'INVOICE' | 'BILL' | 'SALES_RECEIPT'; toId: number; amount: number }[];
}

/**
 * One payment: how much, how, and what it paid; the rest is a deposit (customer) or an advance (supplier). Owners and
 * Managers void one made by mistake (PLAIN.md 11.1): what it paid is open again.
 */
@Component({
  selector: 'ms-payment-details',
  imports: [NgTemplateOutlet, AttachButton, TranslatePipe, CurrencyPipe, DatePipe, DecimalPipe, Dialog, TableModule, ButtonDirective, ButtonLabel],
  templateUrl: './payment-details.html',
})
export class PaymentDetails {
  /** On a document's own page: no dialog, the content and actions in the page. */
  readonly inline = input(false);
  readonly kind = input.required<'customer' | 'supplier'>();
  readonly payment = model<PaymentDoc | null>(null);
  readonly changed = output<PaymentDoc>();

  private readonly business = inject(BusinessService);
  private readonly voids = inject(VoidService);

  protected readonly busy = signal(false);
  protected readonly canVoid = computed(() => this.business.can(this.kind() === 'customer' ? 'sale:void' : 'bill:manage'));
  /** Money in from a supplier is a refund of a credit, and money taken for a POS sale goes with the sale: neither is voided here. */
  protected readonly voidable = computed(() => {
    const p = this.payment();
    if (!p || p.status !== 'POSTED' || !this.canVoid()) {
      return false;
    }
    return this.kind() === 'customer'
      ? p.direction === 'IN' && !p.allocations.some((a) => a.toType === 'SALES_RECEIPT')
      : p.direction === 'OUT';
  });

  protected voidIt(p: PaymentDoc): void {
    const customer = this.kind() === 'customer';
    this.voids.void<PaymentDoc>(
      customer ? 'paymentReceived' : 'supplierPayment',
      `${customer ? '/payments-received' : '/supplier-payments'}/${p.id}`,
      p.number,
      (updated) => {
        const done = { ...updated, partyName: updated.partyName ?? p.partyName };
        this.payment.set(done);
        this.changed.emit(done);
      },
      (on) => this.busy.set(on),
    );
  }
}
