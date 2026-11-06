import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { BusinessService } from '../../core/business/business.service';
import { NotifyService } from '../../core/notify.service';
import { toIsoDate } from '../dates';
import { LazyList } from '../lazy-list';
import { exportList } from '../list-export';

export type Side = 'CUSTOMER' | 'SUPPLIER';

/** One row of GET /transactions. */
export interface TransactionRow {
  type: string;
  id: number;
  number: string;
  date: string;
  partyId: number | null;
  partyName: string | null;
  branchId: number;
  total: number | null;
  balance: number | null;
  status: string;
  dueDate: string | null;
  overdue: boolean;
}

/** The list (and ?open=) each document type opens in. */
export const VIEW_OF: Record<string, string> = {
  QUOTATION: 'quotations',
  SALES_ORDER: 'sales-orders',
  DELIVERY: 'deliveries',
  INVOICE: 'invoices',
  DEBIT_NOTE: 'invoices',
  SALES_RECEIPT: 'sales-receipts',
  PAYMENT_RECEIVED: 'payments',
  REFUND: 'payments',
  SALES_RETURN: 'returns',
  CREDIT_NOTE: 'credits',
  PURCHASE_ORDER: 'purchase-orders',
  GOODS_RECEIPT: 'goods-receipts',
  BILL: 'bills',
  SUPPLIER_PAYMENT: 'payments',
  PURCHASE_RETURN: 'returns',
  SUPPLIER_CREDIT: 'credits',
};

/** The translation key of a document's status: orders and credits name theirs their own way. */
export function statusKey(type: string, status: string): string {
  if (type === 'QUOTATION' || type === 'SALES_ORDER') {
    return `orders.status.${status}`;
  }
  if (type === 'CREDIT_NOTE' || type === 'SUPPLIER_CREDIT') {
    return `credits.status.${status}`;
  }
  return `docs.status.${status}`;
}

/**
 * Every document of one side, newest first (PLAIN.md 12.2 "Transactions"), or of one customer or supplier on their page:
 * search, a type dropdown, a date range, and Export. A row says which document to open; the page opens it.
 */
@Component({
  selector: 'ms-transactions-table',
  imports: [
    FormsModule, TranslatePipe, DatePipe, CurrencyPipe, TableModule, Select, DatePicker, IconField, InputIcon, InputText, AutoComplete,
    ButtonDirective, ButtonIcon, ButtonLabel,
  ],
  templateUrl: './transactions-table.html',
  styleUrl: './transactions-table.scss',
})
export class TransactionsTable {
  readonly side = input.required<Side>();
  /** On a customer or supplier page: only theirs, and no party column. */
  readonly partyId = input<number | null>(null);
  /** One type's own list (for example Deliveries): the type dropdown is left out. */
  readonly lockedView = input<string | null>(null);
  /** The name used for the exported file. */
  readonly fileName = input('transactions');
  readonly open = output<{ view: string; id: number; row: TransactionRow }>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);

  protected readonly q = signal('');
  protected readonly view = signal<string | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly views = signal<string[]>([]);
  /** The customer or supplier picked in the list's own filter (PLAIN.md 12.2: one dropdown per filter, party included). */
  protected readonly party = signal<{ id: number; name: string } | null>(null);
  protected readonly parties = signal<{ id: number; name: string }[]>([]);
  protected readonly exporting = signal(false);
  /** One dropdown per filter (PLAIN.md 12.2), status included: the statuses this side's documents use. */
  protected readonly status = signal<string | null>(null);
  protected readonly statusOptions = computed(() => {
    const own = this.side() === 'CUSTOMER'
      ? [['DRAFT', 'QUOTATION'], ['SENT', 'QUOTATION'], ['CONFIRMED', 'SALES_ORDER'], ['UNPAID', 'INVOICE'], ['PARTLY_PAID', 'INVOICE'], ['PAID', 'INVOICE']]
      : [['DRAFT', 'PURCHASE_ORDER'], ['ORDERED', 'PURCHASE_ORDER'], ['PARTIALLY_RECEIVED', 'PURCHASE_ORDER'], ['UNPAID', 'BILL'], ['PARTLY_PAID', 'BILL'], ['PAID', 'BILL']];
    return [...own, ['POSTED', 'INVOICE'], ['WAITING_APPROVAL', 'INVOICE'], ['OPEN', 'INVOICE'], ['VOID', 'INVOICE']]
      .map(([value, type]) => ({ value, label: statusKey(type, value) }));
  });
  protected readonly viewOptions = computed(() => this.views().map((v) => ({ value: v, label: `tx.views.${v}` })));

  private readonly search = new Subject<string>();
  protected readonly list = new LazyList<TransactionRow>(
    (query) => this.api.page<TransactionRow>('/transactions', { page: query.page, size: query.size }, this.filters()),
    (e) => this.notify.error(e),
  );

  constructor() {
    this.search.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef))).subscribe((q) => {
      this.q.set(q.trim());
      this.list.reload();
    });
    effect(() => {
      const side = this.side();
      untracked(() =>
        this.api.get<string[]>(`/transactions/views?side=${side}`).subscribe({ next: (v) => this.views.set(v), error: () => this.views.set([]) }),
      );
    });
    // The branch in the top bar changes what the list holds
    let first = true;
    effect(() => {
      this.business.branchId();
      this.business.businessId();
      if (first) {
        first = false;
        return;
      }
      untracked(() => this.list.reload());
    });
  }

  /** After a document changed elsewhere on the page. */
  refresh(): void {
    this.list.refresh();
  }

  protected onSearch(value: string): void {
    this.search.next(value);
  }

  protected findParty(e: AutoCompleteCompleteEvent): void {
    this.api
      .page<{ id: number; name: string }>(this.side() === 'CUSTOMER' ? '/customers' : '/suppliers', { page: 0, size: 10 }, { q: e.query })
      .subscribe({ next: (p) => this.parties.set(p.content.map((x) => ({ id: x.id, name: x.name }))) });
  }

  protected setParty(p: { id: number; name: string } | string | null): void {
    // typing without picking keeps the list as it is
    if (typeof p === 'string') {
      return;
    }
    this.party.set(p?.id ? p : null);
    this.list.reload();
  }

  protected setView(v: string | null): void {
    this.view.set(v);
    this.list.reload();
  }

  protected setStatus(s: string | null): void {
    this.status.set(s);
    this.list.reload();
  }

  protected setFrom(d: Date | null): void {
    this.from.set(d);
    this.list.reload();
  }

  protected setTo(d: Date | null): void {
    this.to.set(d);
    this.list.reload();
  }

  protected openRow(row: TransactionRow): void {
    const view = VIEW_OF[row.type];
    if (view) {
      this.open.emit({ view, id: row.id, row });
    }
  }

  protected statusKey = statusKey;

  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    this.exporting.set(true);
    try {
      await exportList<TransactionRow>(
        (page, size) => this.api.page<TransactionRow>('/transactions', { page, size }, this.filters()),
        [
          { header: t('common.date'), value: (r) => r.date },
          { header: t('tx.type'), value: (r) => t(`tx.types.${r.type}`) },
          { header: t('common.number'), value: (r) => r.number },
          ...(this.partyId() ? [] : [{ header: t(this.side() === 'CUSTOMER' ? 'sales.customer' : 'purchase.supplier'), value: (r: TransactionRow) => r.partyName }]),
          { header: t('common.total'), value: (r) => r.total, format: '#,##0.00' },
          { header: t('tx.balance'), value: (r) => r.balance, format: '#,##0.00' },
          { header: t('tx.due'), value: (r) => r.dueDate },
          { header: t('common.status'), value: (r) => t(statusKey(r.type, r.status)) },
        ],
        this.fileName(),
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  private filters(): Record<string, string | number | null> {
    return {
      side: this.side(),
      partyId: this.partyId() ?? this.party()?.id ?? null,
      view: this.lockedView() ?? this.view(),
      q: this.q() || null,
      status: this.status(),
      from: toIsoDate(this.from()),
      to: toIsoDate(this.to()),
    };
  }
}
