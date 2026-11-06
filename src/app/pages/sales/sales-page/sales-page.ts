import { CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';

import { ApiService } from '../../../core/api/api.service';
import { SaleLine } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { VoidService } from '../../../core/void.service';
import { LazyList } from '../../../shared/lazy-list';
import { TransactionsTable, statusKey } from '../../../shared/transactions-table/transactions-table';
import { PaymentDialog } from '../../../shared/payment-dialog/payment-dialog';
import { PaymentDetails, PaymentDoc } from '../../../shared/payment-details/payment-details';
import { PrintDialog, PrintDocument } from '../../../shared/print-dialog/print-dialog';
import { CreditDialog } from '../../../shared/credit-dialog/credit-dialog';
import { DebitDialog, DebitStart, SavedDebit } from '../debit-dialog/debit-dialog';
import { Credit } from '../../../shared/credit-details/credit';
import { CreditDetails } from '../../../shared/credit-details/credit-details';
import { ReturnDoc, ReturnDetails } from '../../../shared/return-details/return-details';
import { OrderDetails, OrderView } from '../order-details/order-details';
import { OrderForm, OrderSaved } from '../order-form/order-form';
import { OrderFormTarget, Quotation, SalesOrder } from '../orders/orders';
import { ReturnDialog, ReturnSaved } from '../return-dialog/return-dialog';
import { AttachButton } from '../../../shared/attach-button/attach-button';

interface Receipt {
  id: number;
  number: string;
  customerId: number | null;
  soldAt: string;
  exchangeRate: number;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  totalKhr: number;
  changeKhr: number;
  status: 'POSTED' | 'VOID';
  note: string | null;
  lines: SaleLine[];
  payments: { method: string; currency: string; amount: number }[];
}

interface Invoice {
  id: number;
  number: string;
  type: 'STANDARD' | 'TAX' | 'DEBIT_NOTE';
  exchangeRate: number;
  deliveryId: number | null;
  customerId: number;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  totalKhr: number;
  paidAmount: number;
  balance: number;
  status: 'UNPAID' | 'PARTLY_PAID' | 'PAID' | 'VOID';
  overdue: boolean;
  lines: SaleLine[];
  /** A debit note: why the customer owes more, and the invoice it adds to (FR-3.19). */
  note: string | null;
  relatedInvoiceId: number | null;
  relatedInvoiceNumber: string | null;
}

interface Delivery {
  id: number;
  number: string;
  deliveredAt: string;
  customerId: number | null;
  status: 'DRAFT' | 'POSTED' | 'VOID';
  invoiceId: number | null;
  lines: SaleLine[];
}

interface Customer {
  phone: string | null;
  address: string | null;
  vatTin: string | null;
}

interface Row {
  id: number;
  number: string;
  [key: string]: unknown;
}

type TabName = 'all' | 'quotations' | 'orders' | 'deliveries' | 'receipts' | 'invoices' | 'payments' | 'returns' | 'credits';

/** ?tab= takes the list names of GET /transactions (sales-orders, sales-receipts) and the tab names. */
const TAB_OF: Record<string, TabName> = {
  all: 'all',
  quotations: 'quotations',
  'sales-orders': 'orders',
  orders: 'orders',
  deliveries: 'deliveries',
  invoices: 'invoices',
  'sales-receipts': 'receipts',
  receipts: 'receipts',
  payments: 'payments',
  returns: 'returns',
  credits: 'credits',
};

/**
 * Customer transactions (prototype customer-transactions.html, PLAIN.md 11.7): quotations and sales orders, sales
 * receipts from the POS, invoices to pay later, payments received and credit notes, each in a tab. A receipt opens with its lines and can be voided; payments are
 * received from the header. An invoice opens with its lines and prints as an A4 invoice or a delivery note (FR-3.5).
 */
@Component({
  selector: 'ms-sales-page',
  imports: [NgTemplateOutlet, AttachButton, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, Dialog, ButtonDirective, ButtonIcon, ButtonLabel, PaymentDialog, PrintDialog,
    ReturnDialog, ReturnDetails, CreditDetails, CreditDialog, OrderForm, OrderDetails, Tooltip, DebitDialog, PaymentDetails, Menu, TransactionsTable, RouterLink],
  templateUrl: './sales-page.html',
  styleUrl: './sales-page.scss',
})
export class SalesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly voids = inject(VoidService);

  protected readonly canSell = computed(() => this.business.can('sale:create'));
  protected readonly canVoid = computed(() => this.business.can('sale:void'));
  /** Quotations and orders: seen by those who make, view or deliver them; made by sales_order:manage (FR-3.10, 3.11). */
  protected readonly canOrders = computed(() => ['sales_order:view', 'sales_order:manage', 'delivery:manage'].some((p) => this.business.can(p)));
  protected readonly canManageOrders = computed(() => this.business.can('sales_order:manage'));
  protected readonly canInvoices = computed(() => this.canSell() || this.business.can('customer:view'));
  protected readonly canCredits = computed(() => this.canVoid() || this.business.can('customer:view'));
  /** Deliveries: who delivers orders, and the POS (pay-later sales leave with a delivery). */
  protected readonly canDeliveries = computed(() => this.business.can('delivery:manage') || this.canSell());
  /** "All" first: every document, newest first (PLAIN.md 12.2 Transactions); the other tabs are the type views. */
  protected readonly tab = signal<TabName>('all');
  /** Credit notes by hand: the same people who can void a sale (FR-3.12). */
  protected readonly canReturn = this.canVoid;
  /** Taking goods back: posted by them, or asked for by a Cashier and approved later (section 5). */
  protected readonly canStartReturn = computed(() => this.canVoid() || this.business.can('sales_return:request'));
  protected readonly canReturns = computed(() => this.canStartReturn() || this.business.can('customer:view'));
  /** ?tab=returns from an alert or the dashboard opens that tab. */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });
  /** A document's own page: /customers/transactions/<view>/<id> (PLAIN.md 12.2 View). */
  readonly docView = input<string | undefined>(undefined, { alias: 'view' });
  readonly docId = input<string | undefined>(undefined, { alias: 'id' });
  protected readonly pageMode = computed(() => !!this.docView() && !!Number(this.docId()));
  /** The number and status shown in the page's breadcrumb row. */
  protected readonly pageDoc = computed<{ number: string; status: string; statusKey: string } | null>(() => {
    const of = (type: string, d: { number: string; status: string } | null | undefined) =>
      d ? { number: d.number, status: d.status, statusKey: statusKey(type, d.status) } : null;
    switch (this.docView()) {
      case 'sales-receipts':
        return of('SALES_RECEIPT', this.viewing());
      case 'invoices':
        return of('INVOICE', this.viewingInvoice());
      case 'deliveries':
        return of('DELIVERY', this.viewingDelivery());
      case 'payments':
        return of('PAYMENT_RECEIVED', this.payment());
      case 'returns':
        return of('SALES_RETURN', this.returnDoc());
      case 'credits':
        return of('CREDIT_NOTE', this.creditNote());
      case 'quotations':
        return of('QUOTATION', this.orderView()?.doc as { number: string; status: string } | undefined);
      case 'sales-orders':
        return of('SALES_ORDER', this.orderView()?.doc as { number: string; status: string } | undefined);
      default:
        return null;
    }
  });

  /** ?open=<id> with ?tab=<view>: a document opened from a customer page or a link. */
  readonly openParam = input<string | undefined>(undefined, { alias: 'open' });
  private readonly router = inject(Router);
  private readonly allTable = viewChild<TransactionsTable>('allTable');
  private readonly deliveryTable = viewChild<TransactionsTable>('deliveryTable');
  protected readonly viewingDelivery = signal<Delivery | null>(null);

  /** "+ New": every document this member can make, with the type picked here (PLAIN.md 12.2). */
  protected readonly newItems = computed<MenuItem[]>(() => {
    const t = (key: string) => this.translate.instant(key);
    const items: (MenuItem & { ok: boolean })[] = [
      { label: t('tx.new.sale'), icon: 'pi pi-shopping-cart', ok: this.canSell(), command: () => void this.router.navigate(['/pos']) },
      { label: t('tx.new.quotation'), icon: 'pi pi-file', ok: this.canManageOrders(), command: () => this.newDoc('quotation') },
      { label: t('tx.new.salesOrder'), icon: 'pi pi-clipboard', ok: this.canManageOrders(), command: () => this.newDoc('order') },
      { label: t('tx.new.payment'), icon: 'pi pi-wallet', ok: this.canSell(), command: () => { this.payPreset.set(null); this.payOpen.set(true); } },
      { label: t('tx.new.creditNote'), icon: 'pi pi-replay', ok: this.canReturn(), command: () => this.newCreditOpen.set(true) },
      { label: t('tx.new.debitNote'), icon: 'pi pi-plus-circle', ok: this.canVoid(), command: () => this.newDebit(null) },
    ];
    return items.filter((i) => i.ok).map(({ ok: _ok, ...i }) => i);
  });

  private readonly onError = (e: unknown) => this.notify.error(e);
  protected readonly receipts = new LazyList<Receipt>((q) => this.api.page('/sales-receipts', q), this.onError, 'soldAt,desc');
  protected readonly invoices = new LazyList<Row>((q) => this.api.page('/invoices', q), this.onError, 'invoiceDate,desc');
  protected readonly payments = new LazyList<PaymentDoc>((q) => this.api.page('/payments-received', q), this.onError, 'paidAt,desc');
  protected readonly credits = new LazyList<Credit>((q) => this.api.page('/credit-notes', q), this.onError, 'id,desc');
  protected readonly salesReturns = new LazyList<ReturnDoc>((q) => this.api.page('/sales-returns', q), this.onError, 'id,desc');
  protected readonly returnDoc = signal<ReturnDoc | null>(null);
  protected readonly quotations = new LazyList<Quotation>((q) => this.api.page('/quotations', q), this.onError, 'id,desc');
  protected readonly orders = new LazyList<SalesOrder>((q) => this.api.page('/sales-orders', q), this.onError, 'id,desc');

  /** The quotation or order being made or changed, and the one shown. */
  protected readonly formTarget = signal<OrderFormTarget | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly orderView = signal<OrderView | null>(null);

  protected readonly viewing = signal<Receipt | null>(null);
  protected readonly viewingInvoice = signal<Invoice | null>(null);
  protected readonly payOpen = signal(false);
  /** The customer a payment is received from, when it starts from their invoice. */
  protected readonly payPreset = signal<{ id: number; name: string; balance?: number } | null>(null);
  /** The payment received that is open (PLAIN.md 12: every row opens). */
  protected readonly payment = signal<PaymentDoc | null>(null);
  protected readonly printDoc = signal<PrintDocument | null>(null);
  protected readonly printOpen = signal(false);
  /** The sale goods come back from (a receipt or an invoice), and the credit note shown. */
  protected readonly returnFrom = signal<{ receiptId: number | null; invoiceId: number | null } | null>(null);
  protected readonly returnOpen = signal(false);
  protected readonly creditNote = signal<Credit | null>(null);
  protected readonly newCreditOpen = signal(false);
  /** A debit note (FR-3.19): from the Invoices tab, or raised from an open invoice. */
  protected readonly debitOpen = signal(false);
  protected readonly debitStart = signal<DebitStart | null>(null);

  constructor() {
    // A document's own page loads its document
    effect(() => {
      const view = this.docView();
      const id = Number(this.docId());
      if (view && id) {
        untracked(() => this.openDoc(view, id));
      }
    });
    effect(() => {
      const view = this.tabParam();
      const id = Number(this.openParam());
      untracked(() => {
        const tab = view ? TAB_OF[view] : undefined;
        if (tab) {
          this.tab.set(tab);
        }
        if (view && id) {
          this.openDoc(view, id);
        }
      });
    });
  }

  /** Opens a document on its own page. */
  protected go(view: string, id: number): void {
    void this.router.navigate(['/customers/transactions', view, id]);
  }

  /** On a document's page, what was changed there is loaded again. */
  private reopen(): void {
    const view = this.docView();
    const id = Number(this.docId());
    if (this.pageMode() && view && id) {
      this.openDoc(view, id);
    }
  }

  protected setTab(t: TabName): void {
    this.tab.set(t);
    // The combined lists show what changed in the type tabs
    if (t === 'all') {
      this.allTable()?.refresh();
    } else if (t === 'deliveries') {
      this.deliveryTable()?.refresh();
    }
  }

  /** A document by its list's name and id: opens in its dialog, here (from a row of All, a customer page, a link). */
  protected openDoc(view: string, id: number): void {
    const err = this.onError;
    switch (view) {
      case 'quotations':
        this.api.get<Quotation>(`/quotations/${id}`).subscribe({ next: (q) => this.orderView.set({ kind: 'quotation', doc: q }), error: err });
        break;
      case 'sales-orders':
        this.api.get<SalesOrder>(`/sales-orders/${id}`).subscribe({ next: (o) => this.orderView.set({ kind: 'order', doc: o }), error: err });
        break;
      case 'deliveries':
        this.api.get<Delivery>(`/deliveries/${id}`).subscribe({ next: (d) => this.viewingDelivery.set(d), error: err });
        break;
      case 'invoices':
        this.openInvoice({ id, number: '' });
        break;
      case 'sales-receipts':
        this.api.get<Receipt>(`/sales-receipts/${id}`).subscribe({ next: (r) => this.viewing.set(r), error: err });
        break;
      case 'payments':
        this.api.get<PaymentDoc>(`/payments/${id}`).subscribe({ next: (p) => this.payment.set(p), error: err });
        break;
      case 'returns':
        this.api.get<ReturnDoc>(`/sales-returns/${id}`).subscribe({ next: (r) => this.returnDoc.set(r), error: err });
        break;
      case 'credits':
        this.api.get<Credit>(`/credit-notes/${id}`).subscribe({ next: (c) => this.creditNote.set(c), error: err });
        break;
    }
  }

  /** The delivery's invoice: what was delivered and what it costs. */
  protected deliveryInvoice(d: Delivery): void {
    if (d.invoiceId) {
      if (this.pageMode()) {
        this.go('invoices', d.invoiceId);
        return;
      }
      this.viewingDelivery.set(null);
      this.openInvoice({ id: d.invoiceId, number: '' });
    }
  }

  /** The delivery note, signed on both sides when the goods are handed over. */
  protected printDeliveryNote(d: Delivery): void {
    if (!d.invoiceId) {
      return;
    }
    this.api.get<Invoice>(`/invoices/${d.invoiceId}`).subscribe({ next: (i) => this.printDelivery(i), error: this.onError });
  }

  protected newDoc(kind: 'quotation' | 'order'): void {
    this.formTarget.set({ kind, doc: null });
    this.formOpen.set(true);
  }

  protected editDoc(target: OrderFormTarget): void {
    this.orderView.set(null);
    this.formTarget.set(target);
    this.formOpen.set(true);
  }

  /** Saved from the form: the lists change and the document opens (an order delivered at once opens as the order). */
  protected docSaved(e: OrderSaved): void {
    this.ordersChanged();
    if (e.kind === 'quotation') {
      this.tab.set('quotations');
      this.orderView.set({ kind: 'quotation', doc: e.quotation });
    } else {
      this.tab.set('orders');
      this.orderView.set({ kind: 'order', doc: e.kind === 'order' ? e.order : e.delivered.order });
    }
  }

  protected ordersChanged(): void {
    this.reopen();
    this.quotations.refresh();
    this.orders.refresh();
    if (this.canInvoices()) {
      this.invoices.refresh();
    }
    if (this.canSell()) {
      this.payments.refresh();
    }
  }

  protected startReturn(receiptId: number | null, invoiceId: number | null): void {
    this.returnFrom.set({ receiptId, invoiceId });
    this.returnOpen.set(true);
  }

  /** After a return: the lists, the open invoice (what it still owes) and the credit notes change. */
  protected returned(r: ReturnSaved): void {
    this.salesReturns.refresh();
    if (r.status === 'WAITING_APPROVAL') {
      this.viewing.set(null);
      this.viewingInvoice.set(null);
      this.tab.set('returns');
      return;
    }
    this.receipts.refresh();
    this.invoices.refresh();
    this.credits.refresh();
    this.payments.refresh();
    const inv = this.viewingInvoice();
    if (inv) {
      this.openInvoice({ id: inv.id, number: inv.number });
    }
    if (r.creditNote && r.creditNote.left > 0) {
      this.tab.set('credits');
    }
  }

  /** A request approved or rejected: an approved one is like a return made now. */
  protected returnDecided(r: ReturnDoc): void {
    this.salesReturns.refresh();
    if (r.status === 'POSTED') {
      this.receipts.refresh();
      this.invoices.refresh();
      this.credits.refresh();
      this.payments.refresh();
    }
  }

  protected creditChanged(): void {
    this.reopen();
    this.credits.refresh();
    this.invoices.refresh();
    this.payments.refresh();
  }

  protected openInvoice(row: Row): void {
    this.api.get<Invoice>(`/invoices/${row.id}`).subscribe({ next: (i) => this.viewingInvoice.set(i), error: this.onError });
  }

  /** Receive payment from an open invoice: its customer is picked (the oldest due is paid first). */
  protected receiveFor(i: Invoice): void {
    if (!this.pageMode()) {
      this.viewingInvoice.set(null);
    }
    this.payPreset.set({ id: i.customerId, name: i.customerName, balance: i.balance });
    this.payOpen.set(true);
  }

  protected paid(): void {
    this.reopen();
    this.payPreset.set(null);
    this.reloadAll();
  }

  protected newDebit(start: DebitStart | null): void {
    this.debitStart.set(start);
    this.debitOpen.set(true);
  }

  /** The note just made opens, so it can be printed and given to the customer. */
  protected debitSaved(d: SavedDebit): void {
    this.invoices.refresh();
    this.openInvoice({ id: d.id, number: d.number });
  }

  /** An invoice made by mistake, with nothing paid or returned: it and its delivery are voided, the goods back in stock. */
  protected voidInvoice(i: Invoice): void {
    this.voids.void<Invoice>('invoice', `/invoices/${i.id}`, i.number, (v) => {
      this.viewingInvoice.set(v);
      this.invoices.refresh();
      this.ordersChanged();
    });
  }

  /** After a payment was voided: the invoices it paid are open again. */
  protected paymentVoided(): void {
    this.reopen();
    this.payments.refresh();
    this.invoices.refresh();
  }

  protected voidDebit(i: Invoice): void {
    this.confirm.confirm({
      header: this.translate.instant('debit.void'),
      message: this.translate.instant('debit.voidAsk', { number: i.number }),
      acceptLabel: this.translate.instant('debit.void'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () =>
        this.api.post<Invoice>(`/debit-notes/${i.id}/void`).subscribe({
          next: (v) => {
            this.viewingInvoice.set(v);
            this.invoices.refresh();
            this.notify.showKey('debit.voided', { number: i.number });
          },
          error: this.onError,
        }),
    });
  }

  protected printInvoice(i: Invoice): void {
    const t = (key: string) => this.translate.instant(key);
    const usd = (n: number) => `$${n.toFixed(2)}`;
    const tax = i.type === 'TAX';
    const debit = i.type === 'DEBIT_NOTE';
    const khr = (n: number) => `៛${Math.round(n).toLocaleString('en-US')}`;
    this.withCustomer(i, (lines) => this.showPrint({
      // A tax invoice carries its Khmer title whatever the screen language (FR-3.9)
      title: debit ? t('debit.title') : tax ? `វិក្កយបត្រអាករ · ${t('print.taxInvoiceEn')}` : t('print.invoice'),
      number: i.number,
      date: i.invoiceDate,
      facts: [
        ...(i.relatedInvoiceNumber ? [{ label: t('debit.forInvoice'), value: i.relatedInvoiceNumber }] : []),
        { label: t('sales.due'), value: this.day(i.dueDate) },
        ...(tax ? [{ label: t('print.rate'), value: `$1 = ${khr(i.exchangeRate)}` }] : []),
      ],
      partyLabel: t('print.billTo'),
      partyName: i.customerName,
      partyLines: lines,
      withPrices: true,
      // A debit note has no goods: its reason is the one line
      itemLabel: debit ? t('debit.reason') : undefined,
      lines: debit
        ? [{ name: i.note ?? t('debit.title'), qty: 1, unit: '', price: i.subtotal, total: i.subtotal }]
        : i.lines.map((l) => ({ name: l.productName, qty: l.qty, unit: l.unitSymbol, price: l.unitPrice, total: l.lineTotal })),
      totals: [
        { label: t('print.subtotal'), value: usd(i.subtotal) },
        ...(i.discount ? [{ label: t('print.discount'), value: `−${usd(i.discount)}` }] : []),
        ...(i.vat || tax ? [{ label: t('print.vat'), value: tax ? `${usd(i.vat)} · ${khr(i.vat * i.exchangeRate)}` : usd(i.vat) }] : []),
        { label: t('common.total'), value: `${usd(i.total)} · ${khr(i.totalKhr)}`, strong: true },
        { label: t('print.paid'), value: usd(i.paidAmount) },
        { label: t('sales.balance'), value: usd(i.balance), strong: true },
      ],
      signatures: false,
    }));
  }

  /** The delivery note of the goods that left with this invoice: what and how much, signed on both sides. */
  protected printDelivery(i: Invoice): void {
    if (!i.deliveryId) {
      return;
    }
    const t = (key: string) => this.translate.instant(key);
    this.api.get<Delivery>(`/deliveries/${i.deliveryId}`).subscribe({
      next: (d) =>
        this.withCustomer(i, (lines) => this.showPrint({
          title: t('print.deliveryNote'),
          number: d.number,
          date: d.deliveredAt,
          facts: [{ label: t('print.invoice'), value: i.number }],
          partyLabel: t('print.deliverTo'),
          partyName: i.customerName,
          partyLines: lines,
          withPrices: false,
          lines: i.lines.map((l) => ({ name: l.productName, qty: l.qty, unit: l.unitSymbol })),
          totals: [],
          signatures: true,
        })),
      error: this.onError,
    });
  }

  private withCustomer(i: Invoice, show: (lines: string[]) => void): void {
    this.api.get<Customer>(`/customers/${i.customerId}`).subscribe({
      next: (c) => show([c.phone, c.address, c.vatTin ? `${this.translate.instant('print.vatTin')}: ${c.vatTin}` : null]
        .filter((x): x is string => !!x)),
      error: () => show([]),
    });
  }

  private showPrint(doc: PrintDocument): void {
    this.printDoc.set(doc);
    this.printOpen.set(true);
  }

  private day(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  protected voidSale(r: Receipt): void {
    this.confirm.confirm({
      header: this.translate.instant('sales.voidSale'),
      message: `${r.number} · $${r.total}`,
      acceptLabel: this.translate.instant('sales.voidSale'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () =>
        this.api.post<Receipt>(`/sales-receipts/${r.id}/void`, { reason: this.translate.instant('sales.voidSale') }).subscribe({
          next: (updated) => {
            this.viewing.set(updated);
            this.notify.showKey('sales.voided');
            this.receipts.refresh();
          },
          error: (e) => this.notify.error(e),
        }),
    });
  }

  protected reloadAll(): void {
    this.reopen();
    this.invoices.refresh();
    this.payments.refresh();
  }
}
