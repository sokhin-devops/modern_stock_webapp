import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { DatePicker } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';

import { ApiService } from '../../../core/api/api.service';
import { BatchRow, StockRow, StockSummary } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';

interface DayRow {
  day: string;
  sales: number;
  cost: number;
  profit: number;
}

interface SalesReport {
  documents: number;
  sales: number;
  cost: number;
  grossProfit: number;
  vat: number;
  days: DayRow[];
  topProducts: { productId: number; name: string; qty: number; sales: number; profit: number }[];
}

interface ProfitReport {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  expensesByCategory: { category: string; amount: number }[];
}

interface DebtReport {
  customersOwe: number;
  weOwe: number;
  customers: { id: number; name: string; phone: string | null; balance: number }[];
  suppliers: { id: number; name: string; phone: string | null; balance: number }[];
}

/**
 * Reports (prototype reports.html, PLAIN.md 11.10): sales and profit for a period with a chart by day and the best
 * sellers, the profit and loss with expenses, who owes what, and stock value, low stock and expiry. All for the branch
 * in the top bar.
 */
@Component({
  selector: 'ms-reports-page',
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, DatePicker, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);

  protected readonly tab = signal<'sales' | 'profit' | 'debts' | 'stock'>('sales');
  protected readonly from = signal<Date>(daysAgo(29));
  protected readonly to = signal<Date>(new Date());

  protected readonly sales = signal<SalesReport | null>(null);
  protected readonly profit = signal<ProfitReport | null>(null);
  protected readonly debts = signal<DebtReport | null>(null);
  protected readonly summary = signal<StockSummary | null>(null);
  protected readonly low = signal<StockRow[]>([]);
  protected readonly expiring = signal<BatchRow[]>([]);

  /** Bar heights as a share of the best day. */
  protected readonly maxDay = computed(() => Math.max(1, ...(this.sales()?.days ?? []).map((d) => d.sales)));
  protected readonly margin = computed(() => {
    const s = this.sales();
    return s && s.sales > 0 ? Math.round((s.grossProfit / s.sales) * 100) : 0;
  });

  constructor() {
    // Everything follows the period and the branch in the top bar.
    effect(() => {
      this.business.branchId();
      this.from();
      this.to();
      untracked(() => this.load());
    });
  }

  protected setFrom(d: Date): void {
    if (d) {
      this.from.set(d);
    }
  }

  protected setTo(d: Date): void {
    if (d) {
      this.to.set(d);
    }
  }

  private load(): void {
    const period = { from: toIsoDate(this.from()), to: toIsoDate(this.to()) };
    const fail = (e: unknown) => this.notify.error(e);
    this.api.get<SalesReport>('/reports/sales', period).subscribe({ next: (r) => this.sales.set(r), error: fail });
    this.api.get<ProfitReport>('/reports/profit', period).subscribe({ next: (r) => this.profit.set(r), error: fail });
    this.api.get<DebtReport>('/reports/debts').subscribe({ next: (r) => this.debts.set(r), error: fail });
    if (this.business.can('stock:view')) {
      this.api.get<StockSummary>('/stock/summary').subscribe({ next: (r) => this.summary.set(r) });
      this.api.get<StockRow[]>('/stock/low').subscribe({ next: (r) => this.low.set(r) });
      this.api.get<BatchRow[]>('/stock/batches', { expiringInDays: 30 }).subscribe({ next: (r) => this.expiring.set(r) });
    }
  }
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
