import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { CreditDialog } from '../../../shared/credit-dialog/credit-dialog';
import { Credit } from '../../../shared/credit-drawer/credit';
import { CreditDrawer } from '../../../shared/credit-drawer/credit-drawer';
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
    ButtonLabel, PurchaseForm, PaymentDialog, PurchaseReturnDialog, CreditDrawer, CreditDialog, Tooltip,
  ],
  templateUrl: './purchases-page.html',
  styleUrl: './purchases-page.scss',
})
export class PurchasesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);

  protected readonly tab = signal<'orders' | 'receipts' | 'bills' | 'payments' | 'credits'>('orders');
  protected readonly canOrder = computed(() => this.business.can('purchase_order:manage'));
  protected readonly canQuick = computed(() => this.canOrder() && this.business.can('goods_receipt:create'));
  protected readonly canBills = computed(() => this.business.can('bill:manage'));

  private readonly onError = (e: unknown) => this.notify.error(e);
  protected readonly orders = new LazyList<PurchaseOrder>((q) => this.api.page('/purchase-orders', q), this.onError, 'createdAt,desc');
  protected readonly receipts = new LazyList<GoodsReceipt>((q) => this.api.page('/goods-receipts', q), this.onError, 'receivedAt,desc');
  protected readonly bills = new LazyList<Row>((q) => this.api.page('/bills', q), this.onError, 'billDate,desc');
  protected readonly payments = new LazyList<Row>((q) => this.api.page('/supplier-payments', q), this.onError, 'paidAt,desc');
  protected readonly credits = new LazyList<Credit>((q) => this.api.page('/supplier-credits', q), this.onError, 'id,desc');

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

  protected openForm(mode: 'quick' | 'order'): void {
    this.formMode.set(mode);
    this.formOpen.set(true);
  }

  protected reloadAll(): void {
    this.orders.refresh();
    this.receipts.refresh();
    this.bills.refresh();
    this.payments.refresh();
    this.credits.refresh();
  }

  protected openReceipt(row: GoodsReceipt): void {
    this.api.get<GoodsReceipt>(`/goods-receipts/${row.id}`).subscribe({ next: (g) => this.viewingReceipt.set(g), error: this.onError });
  }

  /** After a return: the bill it lowered, the credit left over, and the receipt's lines all changed. */
  protected returned(r: PurchaseReturnSaved): void {
    this.reloadAll();
    if (r.credit && r.credit.left > 0) {
      this.viewingReceipt.set(null);
      this.tab.set('credits');
    }
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
