import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { Supplier } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { CreditDialog } from '../../../shared/credit-dialog/credit-dialog';
import { DocPhotoDialog } from '../../../shared/doc-photo-dialog/doc-photo-dialog';
import { Credit } from '../../../shared/credit-drawer/credit';
import { CreditDrawer } from '../../../shared/credit-drawer/credit-drawer';
import { PrintDialog, PrintDocument } from '../../../shared/print-dialog/print-dialog';
import { ReturnDoc, ReturnDrawer } from '../../../shared/return-drawer/return-drawer';
import { LazyList } from '../../../shared/lazy-list';
import { PaymentDialog } from '../../../shared/payment-dialog/payment-dialog';
import { PurchaseForm } from '../purchase-form/purchase-form';
import { PurchaseReturnDialog, PurchaseReturnSaved } from '../purchase-return-dialog/purchase-return-dialog';

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
  billNumber: string | null;
  total: number | null;
  lines: GrnLine[];
}

/**
 * Supplier transactions (prototype supplier-transactions.html, PLAIN.md 11.8): purchase orders, goods received, bills
 * and payments, each in a tab. Quick purchase, a new order, and paying a supplier start from the header.
 */
@Component({
  selector: 'ms-purchases-page',
  imports: [
    TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, Drawer, ButtonDirective, ButtonIcon,
    ButtonLabel, PurchaseForm, PaymentDialog, PurchaseReturnDialog, ReturnDrawer, CreditDrawer, CreditDialog, Tooltip, PrintDialog,
    DocPhotoDialog,
  ],
  templateUrl: './purchases-page.html',
  styleUrl: './purchases-page.scss',
})
export class PurchasesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);

  protected readonly tab = signal<'orders' | 'receipts' | 'bills' | 'payments' | 'returns' | 'credits'>('orders');
  protected readonly canOrder = computed(() => this.business.can('purchase_order:manage'));
  protected readonly canQuick = computed(() => this.canOrder() && this.business.can('goods_receipt:create'));
  protected readonly canBills = computed(() => this.business.can('bill:manage'));
  /** Sending goods back: posted by whoever manages bills, or prepared by a Stock keeper for them (section 5). */
  protected readonly canReturn = computed(() => this.canBills() || this.business.can('purchase_return:prepare'));
  /** ?tab=returns from an alert or the dashboard opens that tab. */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });

  private readonly onError = (e: unknown) => this.notify.error(e);
  protected readonly orders = new LazyList<PurchaseOrder>((q) => this.api.page('/purchase-orders', q), this.onError, 'createdAt,desc');
  protected readonly receipts = new LazyList<GoodsReceipt>((q) => this.api.page('/goods-receipts', q), this.onError, 'receivedAt,desc');
  protected readonly bills = new LazyList<Row>((q) => this.api.page('/bills', q), this.onError, 'billDate,desc');
  protected readonly payments = new LazyList<Row>((q) => this.api.page('/supplier-payments', q), this.onError, 'paidAt,desc');
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

  constructor() {
    effect(() => {
      const t = this.tabParam();
      if (t === 'returns' && untracked(() => this.canReturn())) {
        untracked(() => this.tab.set('returns'));
      }
    });
  }

  protected openForm(mode: 'quick' | 'order'): void {
    this.formMode.set(mode);
    this.formOpen.set(true);
  }

  protected reloadAll(): void {
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
