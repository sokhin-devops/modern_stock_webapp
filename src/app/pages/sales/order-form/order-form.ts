import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { catchError, debounceTime, forkJoin, of, switchMap } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { PaymentMethod } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { fromIsoDate, toIsoDate } from '../../../shared/dates';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { DocLine, LinesEditor, emptyLine } from '../../../shared/lines-editor/lines-editor';
import { filledLines, salesWarehouse, warehouseOptions } from '../../../shared/options';
import { Delivered, OrderFormTarget, Quotation, SalesOrder } from '../orders/orders';

interface Party {
  id: number;
  name: string;
  phone: string | null;
}

interface Preview {
  lines: { unitPrice: number }[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  overLimit: boolean;
}

export type OrderSaved =
  | { kind: 'quotation'; quotation: Quotation }
  | { kind: 'order'; order: SalesOrder }
  | { kind: 'delivered'; delivered: Delivered };

/**
 * A quotation or sales order, new or changed (FR-3.10, FR-3.11; prototype document form): the customer, the lines in
 * their units with line discounts, an order discount and a note. Prices, VAT and totals come from the API as you type
 * (the same rules as the POS). A new order can also be saved, delivered and invoiced at once, paid now or later.
 */
@Component({
  selector: 'ms-order-form',
  imports: [
    FormsModule, TranslatePipe, CurrencyPipe, Dialog, AutoComplete, InputNumber, InputText, Select, SelectButton, DatePicker,
    ButtonDirective, ButtonIcon, ButtonLabel, LinesEditor, FieldLabel,
  ],
  templateUrl: './order-form.html',
  styleUrl: './order-form.scss',
})
export class OrderForm {
  readonly target = input<OrderFormTarget | null>(null);
  readonly visible = model(false);
  readonly saved = output<OrderSaved>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly catalog = inject(CatalogService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly customer = signal<Party | null>(null);
  protected readonly customers = signal<Party[]>([]);
  protected readonly date = signal<Date | null>(null);
  protected readonly warehouseId = signal<number | null>(null);
  protected readonly discount = signal<number | null>(null);
  protected readonly note = signal('');
  protected readonly lines = signal<DocLine[]>([emptyLine()]);
  protected readonly preview = signal<Preview | null>(null);
  protected readonly payNow = signal(false);
  protected readonly method = signal<PaymentMethod>('CASH');
  protected readonly busy = signal(false);
  protected readonly today = new Date();

  protected readonly kind = computed(() => this.target()?.kind ?? 'quotation');
  protected readonly editing = computed(() => !!this.target()?.doc);
  protected readonly canDeliver = computed(() => this.business.can('delivery:manage'));
  protected readonly canOverride = computed(() => this.business.can('sale:override'));
  protected readonly warehouses = computed(() => warehouseOptions(this.business.branches(), this.lang, this.business.branchId()));
  protected readonly filled = computed(() => filledLines(this.lines()));
  /** The API's price for each line of the editor (null for empty lines or while unknown). */
  protected readonly prices = computed(() => {
    const priced = this.preview()?.lines ?? [];
    let n = 0;
    return this.lines().map((l) => (l.product && l.qty ? (priced[n++]?.unitPrice ?? null) : null));
  });
  protected readonly payOptions = [
    { value: false, label: 'purchase.payLater' },
    { value: true, label: 'purchase.payNow' },
  ];
  protected readonly methods = ['CASH', 'KHQR', 'BANK'].map((m) => ({ value: m, label: `docs.methods.${m}` }));

  private readonly request = computed(() => ({
    lines: this.filled().map((l) => ({ productId: l.product!.id, unitId: l.unitId, qty: l.qty, discount: l.discount ?? 0 })),
    discount: this.discount() ?? 0,
  }));

  constructor() {
    effect(() => {
      if (this.visible()) {
        const target = this.target();
        untracked(() => this.load(target));
      }
    });
    toObservable(this.request)
      .pipe(
        debounceTime(300),
        switchMap((req) =>
          req.lines.length && this.visible() ? this.api.post<Preview>('/sales/price', req).pipe(catchError(() => of(null))) : of(null),
        ),
      )
      .subscribe((p) => this.preview.set(p));
  }

  protected findCustomers(event: AutoCompleteCompleteEvent): void {
    this.api.page<Party>('/customers', { page: 0, size: 10 }, { q: event.query }).subscribe({ next: (p) => this.customers.set(p.content) });
  }

  protected submit(deliverNow = false): void {
    const customer = this.customer();
    const lines = this.request().lines;
    if (!customer || !lines.length) {
      this.notify.showKey('docs.noLines');
      return;
    }
    const branchId = this.business.branches().find((b) => b.warehouses.some((w) => w.id === this.warehouseId()))?.id ?? null;
    const common = { customerId: customer.id, branchId, discount: this.discount() ?? 0, note: this.note().trim() || null, lines };
    const doc = this.target()?.doc;
    this.busy.set(true);
    let call;
    if (this.kind() === 'quotation') {
      const body = { ...common, validUntil: toIsoDate(this.date()) };
      call = doc ? this.api.put<Quotation>(`/quotations/${doc.id}`, body) : this.api.post<Quotation>('/quotations', body);
    } else if (deliverNow) {
      const total = this.preview()?.total ?? 0;
      const payments = this.payNow() && total > 0 ? [{ method: this.method(), currency: 'USD', amount: total }] : [];
      call = this.api.post<Delivered>('/sales-orders/quick', { ...common, warehouseId: this.warehouseId(), payments });
    } else {
      const body = { ...common, warehouseId: this.warehouseId(), deliveryDate: toIsoDate(this.date()) };
      call = doc ? this.api.put<SalesOrder>(`/sales-orders/${doc.id}`, body) : this.api.post<SalesOrder>('/sales-orders', body);
    }
    call.subscribe({
      next: (result: unknown) => {
        this.busy.set(false);
        if (this.kind() === 'quotation') {
          const q = result as Quotation;
          this.notify.showKey(doc ? 'orders.quotationChanged' : 'orders.quotationSaved', { number: q.number });
          this.saved.emit({ kind: 'quotation', quotation: q });
        } else if (deliverNow) {
          const d = result as Delivered;
          this.notify.showKey('orders.delivered', { delivery: d.deliveryNumber, invoice: d.invoiceNumber });
          this.saved.emit({ kind: 'delivered', delivered: d });
        } else {
          const o = result as SalesOrder;
          this.notify.showKey(doc ? 'orders.orderChanged' : 'orders.orderSaved', { number: o.number });
          this.saved.emit({ kind: 'order', order: o });
        }
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  private load(target: OrderFormTarget | null): void {
    const doc = target?.doc ?? null;
    this.preview.set(null);
    this.payNow.set(false);
    this.method.set('CASH');
    this.customer.set(doc ? { id: doc.customerId, name: doc.customerName, phone: null } : null);
    this.discount.set(doc?.orderDiscount || null);
    this.note.set(doc?.note ?? '');
    if (target?.kind === 'quotation') {
      this.date.set(target.doc ? fromIsoDate(target.doc.validUntil) : addDays(new Date(), 14));
      this.warehouseId.set(salesWarehouse(this.business.branches(), this.business.branchId()));
    } else {
      this.date.set(target?.doc ? fromIsoDate(target.doc.deliveryDate) : null);
      this.warehouseId.set(target?.doc?.warehouseId ?? salesWarehouse(this.business.branches(), this.business.branchId()));
    }
    this.lines.set([emptyLine()]);
    if (!doc?.lines.length) {
      return;
    }
    // The editor works with whole products: fetch each one once, then rebuild the lines with their quantities.
    const ids = [...new Set(doc.lines.map((l) => l.productId))];
    forkJoin(ids.map((id) => this.catalog.getProduct(id))).subscribe({
      next: (products) => {
        const byId = new Map(products.map((p) => [p.id, p]));
        const lines: DocLine[] = doc.lines.map((l) => {
          const p = byId.get(l.productId) ?? null;
          return {
            ...emptyLine(),
            product: p,
            unitId: p && l.unitId === p.baseUnitId ? null : l.unitId,
            qty: 'qtyOrdered' in l ? l.qtyOrdered : l.qty,
            discount: l.discount || null,
          };
        });
        this.lines.set([...lines, emptyLine()]);
      },
      error: (e) => this.notify.error(e),
    });
  }
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}
