import { CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, model, output, signal, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { PrintDialog, PrintDocument } from '../../../shared/print-dialog/print-dialog';
import { DeliverDialog } from '../deliver-dialog/deliver-dialog';
import { Delivered, OrderFormTarget, Quotation, SalesOrder } from '../orders/orders';
import { AttachButton } from '../../../shared/attach-button/attach-button';

export type OrderView = { kind: 'quotation'; doc: Quotation } | { kind: 'order'; doc: SalesOrder };

interface Customer {
  phone: string | null;
  address: string | null;
  vatTin: string | null;
}

/**
 * One quotation or sales order (FR-3.10, FR-3.11): who, what, at what prices, and where it stands. A quotation is sent,
 * declined or made into a sales order; an order is delivered (all or part, each delivery with its invoice), closed
 * early or cancelled. Both print as an A4 document to give the customer, or as a proforma invoice (FR-3.18) when the
 * customer pays before delivery: it asks for the money and is not a tax invoice.
 */
@Component({
  selector: 'ms-order-details',
  imports: [NgTemplateOutlet, AttachButton, TranslatePipe, CurrencyPipe, DatePipe, DecimalPipe, Dialog, TableModule, ButtonDirective, ButtonIcon, ButtonLabel, PrintDialog, DeliverDialog],
  templateUrl: './order-details.html',
  styleUrl: './order-details.scss',
})
export class OrderDetails {
  /** On a document's own page: no dialog, the content and actions in the page. */
  readonly inline = input(false);
  readonly view = model<OrderView | null>(null);
  readonly edit = output<OrderFormTarget>();
  readonly changed = output<void>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly canManage = computed(() => this.business.can('sales_order:manage'));
  protected readonly canDeliver = computed(() => this.business.can('delivery:manage'));
  protected readonly quotation = computed(() => {
    const v = this.view();
    return v?.kind === 'quotation' ? v.doc : null;
  });
  protected readonly order = computed(() => {
    const v = this.view();
    return v?.kind === 'order' ? v.doc : null;
  });
  /** A proforma invoice asks for money before delivery: from a quotation still open, or an order still to deliver. */
  protected readonly proformaOk = computed(() => {
    const q = this.quotation();
    const o = this.order();
    return q ? q.status === 'DRAFT' || q.status === 'SENT' : !!o && (o.status === 'CONFIRMED' || o.status === 'PARTIALLY_DELIVERED');
  });
  protected readonly nothingDelivered = computed(() => this.order()?.lines.every((l) => l.qtyDelivered === 0) ?? false);
  protected readonly busy = signal(false);
  protected readonly deliverOpen = signal(false);
  protected readonly printDoc = signal<PrintDocument | null>(null);
  protected readonly printOpen = signal(false);

  // ---------------------------------------------------------------- quotations

  protected send(q: Quotation): void {
    this.act(this.api.post<Quotation>(`/quotations/${q.id}/send`), 'orders.sent', (d) => this.view.set({ kind: 'quotation', doc: d }));
  }

  protected decline(q: Quotation): void {
    this.ask('orders.decline', q.number, () =>
      this.act(this.api.post<Quotation>(`/quotations/${q.id}/decline`), 'orders.declined', (d) => this.view.set({ kind: 'quotation', doc: d })),
    );
  }

  protected remove(q: Quotation): void {
    this.ask('common.delete', q.number, () => this.act(this.api.delete(`/quotations/${q.id}`), 'orders.deleted', () => this.view.set(null)));
  }

  /** Accepted: the quotation becomes a sales order, which opens. */
  protected convert(q: Quotation): void {
    this.act(this.api.post<SalesOrder>(`/quotations/${q.id}/convert`), 'orders.converted', (o) => this.view.set({ kind: 'order', doc: o }), {
      number: q.number,
    });
  }

  // ---------------------------------------------------------------- sales orders

  protected cancel(o: SalesOrder): void {
    this.ask('orders.cancel', o.number, () =>
      this.act(this.api.post<SalesOrder>(`/sales-orders/${o.id}/cancel`), 'orders.cancelled', (d) => this.view.set({ kind: 'order', doc: d })),
    );
  }

  protected close(o: SalesOrder): void {
    this.ask('orders.close', o.number, () =>
      this.act(this.api.post<SalesOrder>(`/sales-orders/${o.id}/close`), 'orders.closed', (d) => this.view.set({ kind: 'order', doc: d })),
    );
  }

  protected delivered(d: Delivered): void {
    this.view.set({ kind: 'order', doc: d.order });
    this.changed.emit();
  }

  protected startEdit(): void {
    const v = this.view();
    if (v) {
      this.edit.emit(v.kind === 'quotation' ? { kind: 'quotation', doc: v.doc } : { kind: 'order', doc: v.doc });
    }
  }

  // ---------------------------------------------------------------- print

  protected print(proforma = false): void {
    const v = this.view();
    if (!v) {
      return;
    }
    const t = (key: string) => this.translate.instant(key);
    const usd = (n: number) => `$${n.toFixed(2)}`;
    const d = v.doc;
    const facts =
      v.kind === 'quotation'
        ? [{ label: t('orders.validUntil'), value: day(v.doc.validUntil) }]
        : [
            ...(v.doc.deliveryDate ? [{ label: t('orders.deliveryDate'), value: day(v.doc.deliveryDate) }] : []),
            ...(v.doc.quotationNumber ? [{ label: t('orders.quotation'), value: v.doc.quotationNumber }] : []),
          ];
    this.api.get<Customer>(`/customers/${d.customerId}`).subscribe({
      next: (c) => show([c.phone, c.address, c.vatTin ? `${t('print.vatTin')}: ${c.vatTin}` : null].filter((x): x is string => !!x)),
      error: () => show([]),
    });
    const show = (partyLines: string[]) => {
      this.printDoc.set({
        title: t(proforma ? 'print.proforma' : v.kind === 'quotation' ? 'print.quotation' : 'print.salesOrder'),
        number: d.number,
        date: v.kind === 'quotation' ? v.doc.quoteDate : v.doc.orderDate,
        facts,
        partyLabel: t('print.billTo'),
        partyName: d.customerName,
        partyLines,
        withPrices: true,
        lines: v.kind === 'quotation'
          ? v.doc.lines.map((l) => ({ name: l.productName, qty: l.qty, unit: l.unitSymbol, price: l.unitPrice, total: l.lineTotal }))
          : v.doc.lines.map((l) => ({ name: l.productName, qty: l.qtyOrdered, unit: l.unitSymbol, price: l.unitPrice, total: l.lineTotal })),
        totals: [
          { label: t('print.subtotal'), value: usd(d.subtotal) },
          ...(d.discount ? [{ label: t('print.discount'), value: `−${usd(d.discount)}` }] : []),
          ...(d.vat ? [{ label: t('print.vat'), value: usd(d.vat) }] : []),
          { label: t('common.total'), value: usd(d.total), strong: true },
        ],
        signatures: false,
        note: d.note,
        notice: proforma ? t('print.proformaNotice') : undefined,
      });
      this.printOpen.set(true);
    };
  }

  // ---------------------------------------------------------------- helpers

  private ask(action: string, number: string, accept: () => void): void {
    this.confirm.confirm({
      header: this.translate.instant(action),
      message: number,
      acceptLabel: this.translate.instant(action),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept,
    });
  }

  private act<T>(call: Observable<T>, doneKey: string, after: (result: T) => void, params?: Record<string, unknown>): void {
    this.busy.set(true);
    call.subscribe({
      next: (result) => {
        this.busy.set(false);
        this.notify.showKey(doneKey, params);
        after(result);
        this.changed.emit();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}

function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
