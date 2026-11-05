import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';

import { ApiService } from '../../../core/api/api.service';
import { SaleLine } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { LazyList } from '../../../shared/lazy-list';
import { PaymentDialog } from '../../../shared/payment-dialog/payment-dialog';
import { PrintDialog, PrintDocument } from '../../../shared/print-dialog/print-dialog';
import { CreditDialog } from '../../../shared/credit-dialog/credit-dialog';
import { Credit } from '../../../shared/credit-drawer/credit';
import { CreditDrawer } from '../../../shared/credit-drawer/credit-drawer';
import { ReturnDoc, ReturnDrawer } from '../../../shared/return-drawer/return-drawer';
import { OrderDrawer, OrderView } from '../order-drawer/order-drawer';
import { OrderForm, OrderSaved } from '../order-form/order-form';
import { OrderFormTarget, Quotation, SalesOrder } from '../orders/orders';
import { ReturnDialog, ReturnSaved } from '../return-dialog/return-dialog';

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
}

interface Delivery {
  id: number;
  number: string;
  deliveredAt: string;
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

/**
 * Customer transactions (prototype customer-transactions.html, PLAIN.md 11.7): quotations and sales orders, sales
 * receipts from the POS, invoices to pay later, payments received and credit notes, each in a tab. A receipt opens with its lines and can be voided; payments are
 * received from the header. An invoice opens with its lines and prints as an A4 invoice or a delivery note (FR-3.5).
 */
@Component({
  selector: 'ms-sales-page',
  imports: [TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, Drawer, ButtonDirective, ButtonIcon, ButtonLabel, PaymentDialog, PrintDialog,
    ReturnDialog, ReturnDrawer, CreditDrawer, CreditDialog, OrderForm, OrderDrawer, Tooltip],
  templateUrl: './sales-page.html',
  styleUrl: './sales-page.scss',
})
export class SalesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly canSell = computed(() => this.business.can('sale:create'));
  protected readonly canVoid = computed(() => this.business.can('sale:void'));
  /** Quotations and orders: seen by those who make, view or deliver them; made by sales_order:manage (FR-3.10, 3.11). */
  protected readonly canOrders = computed(() => ['sales_order:view', 'sales_order:manage', 'delivery:manage'].some((p) => this.business.can(p)));
  protected readonly canManageOrders = computed(() => this.business.can('sales_order:manage'));
  protected readonly canInvoices = computed(() => this.canSell() || this.business.can('customer:view'));
  protected readonly canCredits = computed(() => this.canVoid() || this.business.can('customer:view'));
  protected readonly tab = signal<'quotations' | 'orders' | 'receipts' | 'invoices' | 'payments' | 'returns' | 'credits'>(
    this.canSell() ? 'receipts' : this.canOrders() ? 'orders' : 'invoices',
  );
  /** Credit notes by hand: the same people who can void a sale (FR-3.12). */
  protected readonly canReturn = this.canVoid;
  /** Taking goods back: posted by them, or asked for by a Cashier and approved later (section 5). */
  protected readonly canStartReturn = computed(() => this.canVoid() || this.business.can('sales_return:request'));
  protected readonly canReturns = computed(() => this.canStartReturn() || this.business.can('customer:view'));
  /** ?tab=returns from an alert or the dashboard opens that tab. */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });

  private readonly onError = (e: unknown) => this.notify.error(e);
  protected readonly receipts = new LazyList<Receipt>((q) => this.api.page('/sales-receipts', q), this.onError, 'soldAt,desc');
  protected readonly invoices = new LazyList<Row>((q) => this.api.page('/invoices', q), this.onError, 'invoiceDate,desc');
  protected readonly payments = new LazyList<Row>((q) => this.api.page('/payments-received', q), this.onError, 'paidAt,desc');
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
  protected readonly printDoc = signal<PrintDocument | null>(null);
  protected readonly printOpen = signal(false);
  /** The sale goods come back from (a receipt or an invoice), and the credit note shown. */
  protected readonly returnFrom = signal<{ receiptId: number | null; invoiceId: number | null } | null>(null);
  protected readonly returnOpen = signal(false);
  protected readonly creditNote = signal<Credit | null>(null);
  protected readonly newCreditOpen = signal(false);

  constructor() {
    effect(() => {
      const t = this.tabParam();
      if (t === 'returns' && untracked(() => this.canReturns())) {
        untracked(() => this.tab.set('returns'));
      }
    });
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
    this.credits.refresh();
    this.invoices.refresh();
    this.payments.refresh();
  }

  protected openInvoice(row: Row): void {
    this.api.get<Invoice>(`/invoices/${row.id}`).subscribe({ next: (i) => this.viewingInvoice.set(i), error: this.onError });
  }

  protected printInvoice(i: Invoice): void {
    const t = (key: string) => this.translate.instant(key);
    const usd = (n: number) => `$${n.toFixed(2)}`;
    const tax = i.type === 'TAX';
    const khr = (n: number) => `៛${Math.round(n).toLocaleString('en-US')}`;
    this.withCustomer(i, (lines) => this.showPrint({
      // A tax invoice carries its Khmer title whatever the screen language (FR-3.9)
      title: tax ? `វិក្កយបត្រអាករ · ${t('print.taxInvoiceEn')}` : t('print.invoice'),
      number: i.number,
      date: i.invoiceDate,
      facts: [
        { label: t('sales.due'), value: this.day(i.dueDate) },
        ...(tax ? [{ label: t('print.rate'), value: `$1 = ${khr(i.exchangeRate)}` }] : []),
      ],
      partyLabel: t('print.billTo'),
      partyName: i.customerName,
      partyLines: lines,
      withPrices: true,
      lines: i.lines.map((l) => ({ name: l.productName, qty: l.qty, unit: l.unitSymbol, price: l.unitPrice, total: l.lineTotal })),
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
    this.invoices.refresh();
    this.payments.refresh();
  }
}
