import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Menu } from 'primeng/menu';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { of } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { Customer, Supplier } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { CreditDialog } from '../../../shared/credit-dialog/credit-dialog';
import { addDays, fromIsoDate, toIsoDate } from '../../../shared/dates';
import { exportList } from '../../../shared/list-export';
import { PaymentDialog } from '../../../shared/payment-dialog/payment-dialog';
import { TransactionsTable } from '../../../shared/transactions-table/transactions-table';
import { PurchaseForm } from '../../purchases/purchase-form/purchase-form';
import { OrderForm } from '../../sales/order-form/order-form';
import { OrderFormTarget } from '../../sales/orders/orders';
import { Partner, PartnerForm, PartnerKind } from '../partner-form/partner-form';

interface Summary {
  balance: number;
  overdue: number;
  overdueCount: number;
  thisYear: number;
  branches: { branchId: number; branchName: string; balance: number }[];
  openingBalance: number;
}

interface StatementLine {
  date: string;
  type: string;
  number: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Statement {
  from: string;
  to: string;
  opening: number;
  debits: number;
  credits: number;
  closing: number;
  lines: StatementLine[];
}

/**
 * One customer or supplier (PLAIN.md 12.2): a summary band with their contact facts and the three key amounts (what is
 * owed, the overdue part, this year's sales or bills), which the chevron in the breadcrumb row hides; tabs Transactions
 * and Statement; "+ New" makes a document with them already picked. A document opens in its Transactions list.
 */
@Component({
  selector: 'ms-partner-page',
  imports: [
    FormsModule, RouterLink, TranslatePipe, CurrencyPipe, DatePipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, DatePicker,
    Menu, ButtonDirective, ButtonIcon, ButtonLabel, TransactionsTable, PartnerForm, PaymentDialog, CreditDialog, OrderForm,
    PurchaseForm,
  ],
  templateUrl: './partner-page.html',
  styleUrl: './partner-page.scss',
})
export class PartnerPage {
  /** The :id of the route. */
  readonly id = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly kind: PartnerKind = inject(ActivatedRoute).snapshot.routeConfig?.path?.startsWith('suppliers') ? 'supplier' : 'customer';
  protected readonly isCustomer = this.kind === 'customer';
  protected readonly partyId = computed(() => Number(this.id()));

  protected readonly partner = signal<Partner | null>(null);
  protected readonly summary = signal<Summary | null>(null);
  protected readonly showSummary = signal(true);
  protected readonly tab = signal<'transactions' | 'statement'>('transactions');
  protected readonly table = viewChild(TransactionsTable);

  protected readonly canEdit = computed(() => this.business.can(this.isCustomer ? 'customer:manage' : 'supplier:manage'));

  // Statement: the last 90 days unless picked
  protected readonly stFrom = signal<Date | null>(addDays(new Date(), -89));
  protected readonly stTo = signal<Date | null>(new Date());
  protected readonly statement = signal<Statement | null>(null);
  protected readonly stLoading = signal(false);

  // The dialogs "+ New" opens, with this party picked
  protected readonly editOpen = signal(false);
  protected readonly payOpen = signal(false);
  protected readonly creditOpen = signal(false);
  protected readonly orderTarget = signal<OrderFormTarget | null>(null);
  protected readonly orderOpen = signal(false);
  protected readonly purchaseMode = signal<'quick' | 'order'>('order');
  protected readonly purchaseOpen = signal(false);

  protected readonly preset = computed(() => {
    const p = this.partner();
    return p ? { id: p.id, name: p.name, balance: p.balance } : null;
  });
  protected readonly presetSupplier = computed(() => (this.isCustomer ? null : (this.partner() as Supplier | null)));
  protected readonly customer = computed(() => (this.isCustomer ? (this.partner() as Customer | null) : null));
  protected readonly supplier = computed(() => (this.isCustomer ? null : (this.partner() as Supplier | null)));

  protected readonly newItems = computed<MenuItem[]>(() => {
    const can = (p: string) => this.business.can(p);
    const items: MenuItem[] = this.isCustomer
      ? [
          { label: 'tx.new.quotation', icon: 'pi pi-file', visible: can('sales_order:manage'), command: () => this.newOrder('quotation') },
          { label: 'tx.new.salesOrder', icon: 'pi pi-clipboard', visible: can('sales_order:manage'), command: () => this.newOrder('order') },
          { label: 'tx.new.payment', icon: 'pi pi-wallet', visible: can('sale:create'), command: () => this.payOpen.set(true) },
          { label: 'tx.new.creditNote', icon: 'pi pi-replay', visible: can('sale:void'), command: () => this.creditOpen.set(true) },
        ]
      : [
          { label: 'tx.new.purchaseOrder', icon: 'pi pi-file', visible: can('purchase_order:manage'), command: () => this.newPurchase('order') },
          {
            label: 'tx.new.quickPurchase', icon: 'pi pi-bolt', visible: can('purchase_order:manage') && can('goods_receipt:create'),
            command: () => this.newPurchase('quick'),
          },
          { label: 'tx.new.supplierPayment', icon: 'pi pi-wallet', visible: can('bill:manage'), command: () => this.payOpen.set(true) },
          { label: 'tx.new.supplierCredit', icon: 'pi pi-replay', visible: can('bill:manage'), command: () => this.creditOpen.set(true) },
        ];
    return items.filter((i) => i.visible).map((i) => ({ ...i, label: this.translate.instant(i.label!) }));
  });

  constructor() {
    effect(() => {
      const id = this.partyId();
      this.business.businessId();
      untracked(() => this.load(id));
    });
  }

  protected toggleSummary(): void {
    this.showSummary.update((v) => !v);
  }

  /** A row of the Transactions tab opens in its own list, on the customers' or suppliers' Transactions page. */
  protected openDoc(e: { view: string; id: number }): void {
    void this.router.navigate([this.isCustomer ? '/customers/transactions' : '/suppliers/transactions', e.view, e.id]);
  }

  /** After a document was made here, or the customer or supplier was changed. */
  protected changed(): void {
    this.load(this.partyId());
    this.table()?.refresh();
    if (this.statement()) {
      this.loadStatement();
    }
  }

  protected setTab(t: 'transactions' | 'statement'): void {
    this.tab.set(t);
    if (t === 'statement' && !this.statement()) {
      this.loadStatement();
    }
  }

  protected loadStatement(): void {
    const from = toIsoDate(this.stFrom());
    const to = toIsoDate(this.stTo());
    const query = [from ? `from=${from}` : '', to ? `to=${to}` : ''].filter(Boolean).join('&');
    this.stLoading.set(true);
    this.api.get<Statement>(`/${this.isCustomer ? 'customers' : 'suppliers'}/${this.partyId()}/statement${query ? '?' + query : ''}`).subscribe({
      next: (s) => {
        this.stLoading.set(false);
        this.statement.set(s);
      },
      error: (e) => {
        this.stLoading.set(false);
        this.notify.error(e);
      },
    });
  }

  protected async exportStatement(): Promise<void> {
    const s = this.statement();
    const p = this.partner();
    if (!s || !p) {
      return;
    }
    const t = (key: string) => this.translate.instant(key);
    const rows: StatementLine[] = [
      { date: s.from, type: 'OPENING', number: '', debit: 0, credit: 0, balance: s.opening },
      ...s.lines,
      { date: s.to, type: 'CLOSING', number: '', debit: s.debits, credit: s.credits, balance: s.closing },
    ];
    await exportList<StatementLine>(
      () => of({ content: rows, page: 0, size: rows.length, totalElements: rows.length, totalPages: 1 }),
      [
        { header: t('common.date'), value: (r) => r.date },
        { header: t('tx.type'), value: (r) => t(`party.statementTypes.${r.type}`) },
        { header: t('common.number'), value: (r) => r.number },
        { header: t('party.debit'), value: (r) => r.debit || null, format: '#,##0.00' },
        { header: t('party.credit'), value: (r) => r.credit || null, format: '#,##0.00' },
        { header: t('party.runningBalance'), value: (r) => r.balance, format: '#,##0.00' },
      ],
      `statement-${p.name.replace(/[^\p{L}\p{N}]+/gu, '-')}`,
    );
  }

  protected setStFrom(d: Date | null): void {
    this.stFrom.set(d);
    this.loadStatement();
  }

  protected setStTo(d: Date | null): void {
    this.stTo.set(d);
    this.loadStatement();
  }

  protected day(iso: string): Date | null {
    return fromIsoDate(iso);
  }

  private newOrder(kind: 'quotation' | 'order'): void {
    const p = this.partner();
    this.orderTarget.set({ kind, doc: null, customer: p ? { id: p.id, name: p.name } : undefined });
    this.orderOpen.set(true);
  }

  private newPurchase(mode: 'quick' | 'order'): void {
    this.purchaseMode.set(mode);
    this.purchaseOpen.set(true);
  }

  private load(id: number): void {
    const base = `/${this.isCustomer ? 'customers' : 'suppliers'}/${id}`;
    this.api.get<Partner>(base).subscribe({ next: (p) => this.partner.set(p), error: (e) => this.notify.error(e) });
    this.api.get<Summary>(`${base}/summary`).subscribe({ next: (s) => this.summary.set(s), error: () => this.summary.set(null) });
  }
}
