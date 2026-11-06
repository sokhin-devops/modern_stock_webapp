import { CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { Dialog } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { Supplier } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { VoidService } from '../../../core/void.service';
import { CreditDialog } from '../../../shared/credit-dialog/credit-dialog';
import { DocPhotoDialog } from '../../../shared/doc-photo-dialog/doc-photo-dialog';
import { Credit } from '../../../shared/credit-details/credit';
import { CreditDetails } from '../../../shared/credit-details/credit-details';
import { PrintDialog, PrintDocument } from '../../../shared/print-dialog/print-dialog';
import { ReturnDoc, ReturnDetails } from '../../../shared/return-details/return-details';
import { LazyList } from '../../../shared/lazy-list';
import { TransactionsTable, statusKey } from '../../../shared/transactions-table/transactions-table';
import { Router, RouterLink } from '@angular/router';
import { PaymentDialog } from '../../../shared/payment-dialog/payment-dialog';
import { PaymentDetails, PaymentDoc } from '../../../shared/payment-details/payment-details';
import { PurchaseForm } from '../purchase-form/purchase-form';
import { PurchaseReturnDialog, PurchaseReturnSaved } from '../purchase-return-dialog/purchase-return-dialog';
import { AttachButton } from '../../../shared/attach-button/attach-button';

interface PoLine {
  id: number;
  productName: string;
  unitSymbol: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  lineTotal: number;
}

interface PurchaseOrder {
  id: number;
  number: string;
  supplierId: number;
  supplierName: string;
  receiveWarehouseId: number;
  receiveWarehouseName: string;
  orderDate: string;
  expectedDate: string | null;
  total: number;
  status: string;
  note: string | null;
  lines: PoLine[];
}

interface Row {
  id: number;
  number: string;
  [key: string]: unknown;
}

interface Bill {
  id: number;
  number: string;
  supplierName: string;
  goodsReceiptId: number | null;
  supplierInvoiceNo: string | null;
  billDate: string;
  dueDate: string;
  total: number;
  paidAmount: number;
  balance: number;
  status: 'UNPAID' | 'PARTLY_PAID' | 'PAID' | 'VOID';
  overdue: boolean;
  note: string | null;
  hasPhoto: boolean;
}

interface GrnLine {
  id: number;
  productName: string;
  unitSymbol: string;
  qty: number;
  unitCost: number;
  batchNo: string | null;
  expiryDate: string | null;
}

interface GoodsReceipt {
  id: number;
  number: string;
  supplierName: string;
  warehouseName: string;
  receivedAt: string;
  status: string;
  billId: number | null;
  billNumber: string | null;
  total: number | null;
  lines: GrnLine[];
}

type TabName = 'all' | 'orders' | 'receipts' | 'bills' | 'payments' | 'returns' | 'credits';

/** ?tab= takes the list names of GET /transactions (purchase-orders, goods-receipts) and the tab names. */
const TAB_OF: Record<string, TabName> = {
  all: 'all',
  'purchase-orders': 'orders',
  orders: 'orders',
  'goods-receipts': 'receipts',
  receipts: 'receipts',
  bills: 'bills',
  payments: 'payments',
  returns: 'returns',
  credits: 'credits',
};

/**
 * Supplier transactions (prototype supplier-transactions.html, PLAIN.md 11.8): purchase orders, goods received, bills
 * and payments, each in a tab. Quick purchase, a new order, and paying a supplier start from the header.
 */
@Component({
  selector: 'ms-purchases-page',
  imports: [NgTemplateOutlet, AttachButton, 
    TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, Dialog, ButtonDirective, ButtonIcon,
    ButtonLabel, PurchaseForm, PaymentDialog, PurchaseReturnDialog, ReturnDetails, CreditDetails, CreditDialog, Tooltip, PrintDialog,
    DocPhotoDialog, PaymentDetails, Menu, TransactionsTable, RouterLink,
  ],
  templateUrl: './purchases-page.html',
  styleUrl: './purchases-page.scss',
})
export class PurchasesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);
  private readonly voids = inject(VoidService);

  /** "All" first: every document, newest first (PLAIN.md 12.2 Transactions); the other tabs are the type views. */
  protected readonly tab = signal<TabName>('all');
  protected readonly canOrder = computed(() => this.business.can('purchase_order:manage'));
  protected readonly canQuick = computed(() => this.canOrder() && this.business.can('goods_receipt:create'));
  protected readonly canBills = computed(() => this.business.can('bill:manage'));
  /** Sending goods back: posted by whoever manages bills, or prepared by a Stock keeper for them (section 5). */
  protected readonly canReturn = computed(() => this.canBills() || this.business.can('purchase_return:prepare'));
  /** ?tab=returns from an alert or the dashboard opens that tab. */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });
  /** A document's own page: /suppliers/transactions/<view>/<id> (PLAIN.md 12.2 View). */
  readonly docView = input<string | undefined>(undefined, { alias: 'view' });
  readonly docId = input<string | undefined>(undefined, { alias: 'id' });
  private readonly router = inject(Router);
  protected readonly pageMode = computed(() => !!this.docView() && !!Number(this.docId()));
  /** The number and status shown in the page's breadcrumb row. */
  protected readonly pageDoc = computed<{ number: string; status: string; statusKey: string } | null>(() => {
    const of = (type: string, d: { number: string; status: string } | null | undefined) =>
      d ? { number: d.number, status: d.status, statusKey: statusKey(type, d.status) } : null;
    switch (this.docView()) {
      case 'purchase-orders':
        return of('PURCHASE_ORDER', this.viewing());
      case 'goods-receipts':
        return of('GOODS_RECEIPT', this.viewingReceipt());
      case 'bills':
        return of('BILL', this.viewingBill());
      case 'payments':
        return of('SUPPLIER_PAYMENT', this.payment());
      case 'returns':
        return of('PURCHASE_RETURN', this.returnDoc());
      case 'credits':
        return of('SUPPLIER_CREDIT', this.credit());
      default:
        return null;
    }
  });

  /** ?open=<id> with ?tab=<view>: a document opened from a supplier page or a link. */
  readonly openParam = input<string | undefined>(undefined, { alias: 'open' });
  private readonly allTable = viewChild<TransactionsTable>('allTable');

  /** "+ New": every document this member can make (PLAIN.md 12.2). */
  protected readonly newItems = computed<MenuItem[]>(() => {
    const t = (key: string) => this.translate.instant(key);
    const items: (MenuItem & { ok: boolean })[] = [
      { label: t('tx.new.purchaseOrder'), icon: 'pi pi-file', ok: this.canOrder(), command: () => this.openForm('order') },
      { label: t('tx.new.quickPurchase'), icon: 'pi pi-bolt', ok: this.canQuick(), command: () => this.openForm('quick') },
      { label: t('tx.new.supplierPayment'), icon: 'pi pi-wallet', ok: this.canBills(), command: () => this.payOpen.set(true) },
      { label: t('tx.new.supplierCredit'), icon: 'pi pi-replay', ok: this.canBills(), command: () => this.newCreditOpen.set(true) },
    ];
    return items.filter((i) => i.ok).map(({ ok: _ok, ...i }) => i);
  });

  private readonly onError = (e: unknown) => this.notify.error(e);
  protected readonly orders = new LazyList<PurchaseOrder>((q) => this.api.page('/purchase-orders', q), this.onError, 'createdAt,desc');
  protected readonly receipts = new LazyList<GoodsReceipt>((q) => this.api.page('/goods-receipts', q), this.onError, 'receivedAt,desc');
  protected readonly bills = new LazyList<Row>((q) => this.api.page('/bills', q), this.onError, 'billDate,desc');
  protected readonly payments = new LazyList<PaymentDoc>((q) => this.api.page('/supplier-payments', q), this.onError, 'paidAt,desc');
  protected readonly credits = new LazyList<Credit>((q) => this.api.page('/supplier-credits', q), this.onError, 'id,desc');
  protected readonly purchaseReturns = new LazyList<ReturnDoc>((q) => this.api.page('/purchase-returns', q), this.onError, 'id,desc');
  protected readonly returnDoc = signal<ReturnDoc | null>(null);

  protected readonly formMode = signal<'quick' | 'order'>('quick');
  protected readonly formOpen = signal(false);
  protected readonly payOpen = signal(false);
  protected readonly viewing = signal<PurchaseOrder | null>(null);
  protected readonly busy = signal(false);
  /** The goods receipt shown, sending goods back from it, and the supplier credit shown (FR-2.7, FR-2.8). */
  protected readonly viewingReceipt = signal<GoodsReceipt | null>(null);
  protected readonly returnOpen = signal(false);
  protected readonly credit = signal<Credit | null>(null);
  protected readonly newCreditOpen = signal(false);
  /** A purchase order printed on A4 to send to the supplier (FR-2.13). */
  protected readonly printDoc = signal<PrintDocument | null>(null);
  protected readonly printOpen = signal(false);
  /** The bill and the supplier payment that are open (PLAIN.md 12: every row opens). */
  protected readonly viewingBill = signal<Bill | null>(null);
  protected readonly payment = signal<PaymentDoc | null>(null);

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
    void this.router.navigate(['/suppliers/transactions', view, id]);
  }

  /** The bill's photo or a payment: over the list the bill's dialog closes first; on its page the bill stays. */
  protected billAction(b: Bill, what: 'photo' | 'pay'): void {
    if (!this.pageMode()) {
      this.viewingBill.set(null);
    }
    if (what === 'photo') {
      this.openBillPhoto(b as unknown as Row);
    } else {
      this.payOpen.set(true);
    }
  }

  /** The goods receipt's bill: its page, or its dialog over the list. */
  protected openReceiptBill(g: GoodsReceipt): void {
    if (!g.billId) {
      return;
    }
    if (this.pageMode()) {
      this.go('bills', g.billId);
      return;
    }
    this.viewingReceipt.set(null);
    this.openBill({ id: g.billId, number: g.billNumber ?? '' });
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
    if (t === 'all') {
      this.allTable()?.refresh();
    }
  }

  /** A document by its list's name and id: opens in its dialog, here (from a row of All, a supplier page, a link). */
  protected openDoc(view: string, id: number): void {
    const err = this.onError;
    switch (view) {
      case 'purchase-orders':
        this.api.get<PurchaseOrder>(`/purchase-orders/${id}`).subscribe({ next: (o) => this.viewing.set(o), error: err });
        break;
      case 'goods-receipts':
        this.openReceipt({ id } as GoodsReceipt);
        break;
      case 'bills':
        this.openBill({ id, number: '' });
        break;
      case 'payments':
        this.api.get<PaymentDoc>(`/payments/${id}`).subscribe({ next: (p) => this.payment.set(p), error: err });
        break;
      case 'returns':
        this.api.get<ReturnDoc>(`/purchase-returns/${id}`).subscribe({ next: (r) => this.returnDoc.set(r), error: err });
        break;
      case 'credits':
        this.api.get<Credit>(`/supplier-credits/${id}`).subscribe({ next: (c) => this.credit.set(c), error: err });
        break;
    }
  }

  protected openForm(mode: 'quick' | 'order'): void {
    this.formMode.set(mode);
    this.formOpen.set(true);
  }

  protected reloadAll(): void {
    this.reopen();
    this.orders.refresh();
    this.receipts.refresh();
    if (this.canReturn()) {
      this.purchaseReturns.refresh();
    }
    if (this.canBills()) {
      this.bills.refresh();
      this.payments.refresh();
      this.credits.refresh();
    }
  }

  protected openReceipt(row: GoodsReceipt): void {
    this.api.get<GoodsReceipt>(`/goods-receipts/${row.id}`).subscribe({ next: (g) => this.viewingReceipt.set(g), error: this.onError });
  }

  protected openBill(row: Row): void {
    this.api.get<Bill>(`/bills/${row.id}`).subscribe({ next: (b) => this.viewingBill.set(b), error: this.onError });
  }

  /** A goods receipt made by mistake, and its bill: the goods leave stock again (PLAIN.md 11.1). */
  protected voidReceipt(g: GoodsReceipt): void {
    this.voids.void<GoodsReceipt>('goodsReceipt', `/goods-receipts/${g.id}`, g.number, (v) => {
      this.viewingReceipt.set(v);
      this.reloadAll();
    }, (on) => this.busy.set(on));
  }

  protected voidBill(b: Bill): void {
    this.voids.void<Bill>('bill', `/bills/${b.id}`, b.number, (v) => {
      this.viewingBill.set(v);
      this.reloadAll();
    }, (on) => this.busy.set(on));
  }

  /** After a return: the bill it lowered, the credit left over, and the receipt's lines all changed. */
  protected returned(r: PurchaseReturnSaved): void {
    this.reloadAll();
    if (r.status === 'WAITING_APPROVAL') {
      this.viewingReceipt.set(null);
      this.tab.set('returns');
    } else if (r.credit && r.credit.left > 0) {
      this.viewingReceipt.set(null);
      this.tab.set('credits');
    }
  }

  /** The bill whose supplier invoice photo is open (FR-2.14). */
  protected readonly billPhoto = signal<Row | null>(null);
  protected readonly billPhotoOpen = signal(false);

  protected openBillPhoto(b: Row): void {
    this.billPhoto.set(b);
    this.billPhotoOpen.set(true);
  }

  protected billPhotoChanged(b: Row, hasPhoto: boolean): void {
    this.bills.rows.update((rows) => rows.map((r) => (r.id === b.id ? { ...r, hasPhoto } : r)));
    this.billPhoto.set({ ...b, hasPhoto });
  }

  protected printOrder(o: PurchaseOrder): void {
    const t = (key: string): string => this.translate.instant(key);
    const show = (partyLines: string[]) => {
      this.printDoc.set({
        title: t('print.purchaseOrder'),
        number: o.number,
        date: o.orderDate,
        facts: [
          ...(o.expectedDate ? [{ label: t('purchase.expected'), value: day(o.expectedDate) }] : []),
          { label: t('print.deliverTo'), value: o.receiveWarehouseName },
        ],
        partyLabel: t('purchase.supplier'),
        partyName: o.supplierName,
        partyLines,
        withPrices: true,
        lines: o.lines.map((l) => ({ name: l.productName, qty: l.qtyOrdered, unit: l.unitSymbol, price: l.unitCost, total: l.lineTotal })),
        totals: [{ label: t('common.total'), value: `$${o.total.toFixed(2)}`, strong: true }],
        signatures: false,
        note: o.note,
      });
      this.printOpen.set(true);
    };
    this.api.get<Supplier>(`/suppliers/${o.supplierId}`).subscribe({
      next: (s) => show([s.contactPerson, s.phone, s.address, s.vatTin ? `${t('print.vatTin')}: ${s.vatTin}` : null]
        .filter((x): x is string => !!x)),
      error: () => show([]),
    });
  }

  /** Order, cancel, close, or receive everything still to come (into the order's warehouse, at the order's cost). */
  protected act(po: PurchaseOrder, action: 'order' | 'cancel' | 'close' | 'receive'): void {
    const call: Observable<unknown> =
      action === 'receive'
        ? this.api.post(`/purchase-orders/${po.id}/receive`, {
            warehouseId: po.receiveWarehouseId,
            lines: po.lines
              .filter((l) => l.qtyOrdered > l.qtyReceived)
              .map((l) => ({ purchaseOrderItemId: l.id, qty: l.qtyOrdered - l.qtyReceived, unitCost: l.unitCost })),
          })
        : this.api.post(`/purchase-orders/${po.id}/${action}`);
    this.busy.set(true);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey(action === 'receive' ? 'purchase.received' : action === 'order' ? 'purchase.ordered' : 'docs.created');
        this.api.get<PurchaseOrder>(`/purchase-orders/${po.id}`).subscribe((fresh) => this.viewing.set(fresh));
        this.reloadAll();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}

/** 2026-11-30 → 30/11/2026, as printed. */
function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
