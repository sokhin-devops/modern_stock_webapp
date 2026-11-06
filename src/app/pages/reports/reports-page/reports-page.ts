import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, ElementRef, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';

import { ApiService, Filters } from '../../../core/api/api.service';
import {
  AbcReport, CountReport, EoqReport, CustomerDebtReport, ExpiryReport, LossReport, OnHandReport, Product, ProfitReport, PurchaseReport, PurchasesBy,
  ReorderReport, SalesBy, SalesReport, ShiftReport, SlowReport, Statement, SupplierDebtReport, VatReport,
} from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { BarChart, BarPoint } from '../../../shared/bar-chart/bar-chart';
import { toIsoDate } from '../../../shared/dates';
import { DocLine } from '../../../shared/lines-editor/lines-editor';
import { PackQtyPipe } from '../../../shared/pack-qty.pipe';
import { ReportMeta, exportReport, printReport } from '../../../shared/report-export';
import { PurchaseForm } from '../../purchases/purchase-form/purchase-form';

export type ReportId =
  | 'sales' | 'gross-profit' | 'profit' | 'customer-debt' | 'supplier-debt'
  | 'stock-on-hand' | 'reorder' | 'expiry' | 'count-differences' | 'abc' | 'eoq'
  | 'losses' | 'slow-moving' | 'cash-shifts' | 'vat' | 'purchases' | 'customer-statement' | 'supplier-statement';

/** Who sees a report: everyone's money (Owner, Manager), sales (a cashier their own), or stock. */
type Access = 'money' | 'sales' | 'stock';

interface ReportDef {
  id: ReportId;
  area: 'sales' | 'purchases' | 'money' | 'stock' | 'analysis';
  icon: string;
  access: Access;
  /** The period it covers by default; none for reports of the present (debts, stock). */
  period: 'days30' | 'days90' | 'month' | 'year' | null;
}

const REPORTS: ReportDef[] = [
  { id: 'sales', area: 'sales', icon: 'pi pi-shopping-cart', access: 'sales', period: 'days30' },
  { id: 'gross-profit', area: 'sales', icon: 'pi pi-chart-line', access: 'money', period: 'days30' },
  { id: 'purchases', area: 'purchases', icon: 'pi pi-shopping-bag', access: 'money', period: 'days30' },
  { id: 'profit', area: 'money', icon: 'pi pi-wallet', access: 'money', period: 'month' },
  { id: 'customer-debt', area: 'money', icon: 'pi pi-users', access: 'money', period: null },
  { id: 'supplier-debt', area: 'money', icon: 'pi pi-truck', access: 'money', period: null },
  { id: 'customer-statement', area: 'money', icon: 'pi pi-file', access: 'money', period: 'days90' },
  { id: 'supplier-statement', area: 'money', icon: 'pi pi-file-edit', access: 'money', period: 'days90' },
  { id: 'cash-shifts', area: 'money', icon: 'pi pi-inbox', access: 'money', period: 'days30' },
  { id: 'vat', area: 'money', icon: 'pi pi-percentage', access: 'money', period: 'year' },
  { id: 'stock-on-hand', area: 'stock', icon: 'pi pi-box', access: 'stock', period: null },
  { id: 'reorder', area: 'stock', icon: 'pi pi-arrow-down', access: 'stock', period: null },
  { id: 'expiry', area: 'stock', icon: 'pi pi-calendar-times', access: 'stock', period: null },
  { id: 'count-differences', area: 'stock', icon: 'pi pi-list-check', access: 'stock', period: 'days30' },
  { id: 'losses', area: 'stock', icon: 'pi pi-exclamation-triangle', access: 'stock', period: 'days30' },
  { id: 'slow-moving', area: 'stock', icon: 'pi pi-hourglass', access: 'stock', period: null },
  { id: 'abc', area: 'analysis', icon: 'pi pi-sort-amount-down', access: 'money', period: 'year' },
  { id: 'eoq', area: 'analysis', icon: 'pi pi-calculator', access: 'money', period: null },
];

const PATHS: Record<ReportId, string> = {
  sales: '/reports/sales',
  'gross-profit': '/reports/sales',
  profit: '/reports/profit',
  'customer-debt': '/reports/customer-debt',
  'supplier-debt': '/reports/supplier-debt',
  'stock-on-hand': '/reports/stock-on-hand',
  reorder: '/reports/reorder',
  expiry: '/reports/expiry',
  'count-differences': '/reports/count-differences',
  abc: '/reports/abc',
  eoq: '/reports/eoq',
  losses: '/reports/losses',
  'slow-moving': '/reports/slow-moving',
  'cash-shifts': '/reports/cash-shifts',
  vat: '/reports/vat',
  purchases: '/reports/purchases',
  'customer-statement': '/reports/statement',
  'supplier-statement': '/reports/statement',
};

interface Party {
  id: number;
  name: string;
  phone: string | null;
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD_SHORT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' });

/**
 * Reports (PLAIN.md 14): one screen with a report picker, filters, totals, a chart where it helps, and a table.
 * The picker lists only what the member's role sees; the report is in the URL (?r=reorder), so dashboard cards can
 * open one. Everything covers the branch in the top bar.
 */
@Component({
  selector: 'ms-reports-page',
  imports: [
    FormsModule, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, DatePicker, ProgressBar, Select, SelectButton, TableModule,
    BarChart, PackQtyPipe, AutoComplete, ButtonDirective, ButtonIcon, ButtonLabel, Tooltip, PurchaseForm, InputNumber,
  ],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {
  private readonly api = inject(ApiService);
  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly catalog = inject(CatalogService);
  private readonly notify = inject(NotifyService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });

  /** The reports this member's role sees, grouped by area for the picker. */
  protected readonly reports = computed(() => {
    this.business.current(); // the role follows the business
    const money = this.business.can('cash_shift:all');
    const sees: Record<Access, boolean> = {
      money,
      sales: money || this.business.can('sale:create'),
      stock: this.business.can('stock:view'),
    };
    return REPORTS.filter((r) => sees[r.access]);
  });
  protected readonly areas = computed(() =>
    (['sales', 'purchases', 'money', 'stock', 'analysis'] as const)
      .map((area) => ({ area, reports: this.reports().filter((r) => r.area === area) }))
      .filter((g) => g.reports.length),
  );
  protected readonly pickerOptions = computed(() => {
    this.lang.lang();
    return this.reports().map((r) => ({ value: r.id, label: this.translate.instant('reports.name.' + r.id) }));
  });

  protected readonly report = computed<ReportDef | null>(() => {
    const id = this.query().get('r');
    return this.reports().find((r) => r.id === id) ?? this.reports()[0] ?? null;
  });

  // Filters. The period starts at the report's own default each time another report opens.
  protected readonly from = linkedSignal<Date>(() => defaultFrom(this.report()?.period ?? 'days30'));
  protected readonly to = linkedSignal<Date>(() => {
    this.report();
    return new Date();
  });
  /** A near-expiry window picked here or in the link; null = the business's first one (FR-7.10). */
  protected readonly days = linkedSignal<number | null>(() => {
    const days = Number(this.query().get('days'));
    return days > 0 ? days : null;
  });
  protected readonly categoryId = signal<number | null>(null);
  protected readonly slowDays = signal<30 | 60 | 90 | 180>(60);
  /** EOQ inputs (FR-5.9): what one order costs (S, USD) and what holding a unit costs a year (H, % of its cost). */
  protected readonly orderCost = signal(5);
  protected readonly holdingPercent = signal(20);
  protected readonly slowOptions = [30, 60, 90, 180].map((value) => ({ value, label: 'reports.withinDays' }));
  protected readonly purchasesBy = computed<PurchasesBy>(() => (this.query().get('by') === 'PRODUCT' ? 'PRODUCT' : 'SUPPLIER'));
  protected readonly purchasesByOptions = (['SUPPLIER', 'PRODUCT'] as const).map((value) => ({ value, label: 'reports.purchasesBy.' + value }));
  /** The customer or supplier of a statement; chosen again when another report opens. */
  protected readonly party = linkedSignal<Party | null>(() => {
    this.report();
    return null;
  });
  protected readonly parties = signal<Party[]>([]);
  protected readonly by = computed<SalesBy>(() => {
    const by = this.query().get('by') as SalesBy | null;
    const allowed = this.report()?.id === 'gross-profit' ? GROSS_BY : SALES_BY;
    return by && allowed.includes(by) ? by : this.report()?.id === 'gross-profit' ? 'PRODUCT' : 'DAY';
  });
  protected readonly byOptions = computed(() =>
    (this.report()?.id === 'gross-profit' ? GROSS_BY : SALES_BY).map((value) => ({ value, label: 'reports.by.' + value })),
  );
  /** The business's windows, from the last expiry report (kept while the next one loads). */
  protected readonly dayOptions = linkedSignal<ExpiryReport | undefined, { value: number; label: string }[]>({
    source: () => this.expiry(),
    computation: (report, previous) =>
      report?.windows.map((value) => ({ value, label: 'reports.withinDays' })) ??
      previous?.value ??
      [30, 60, 90].map((value) => ({ value, label: 'reports.withinDays' })),
  });
  protected readonly categoryOptions = computed(() =>
    this.catalog.categories().map((c) => ({ value: c.id, label: this.lang.name(c.nameEn, c.nameKm) })),
  );

  protected readonly data = rxResource({
    request: () => {
      const r = this.report();
      if (!r) {
        return undefined;
      }
      const filters: Filters = {};
      if (r.period) {
        filters['from'] = toIsoDate(this.from());
        filters['to'] = toIsoDate(this.to());
      }
      if (r.id === 'sales' || r.id === 'gross-profit') {
        filters['by'] = this.by();
      }
      if (r.id === 'expiry' && this.days()) {
        filters['days'] = this.days();
      }
      if (r.id === 'stock-on-hand') {
        filters['categoryId'] = this.categoryId();
      }
      if (r.id === 'slow-moving') {
        filters['days'] = this.slowDays();
      }
      if (r.id === 'eoq') {
        filters['orderCost'] = this.orderCost();
        filters['holdingPercent'] = this.holdingPercent();
      }
      if (r.id === 'purchases') {
        filters['by'] = this.purchasesBy();
      }
      if (r.id === 'customer-statement' || r.id === 'supplier-statement') {
        const party = this.party();
        if (!party) {
          return undefined;
        }
        filters['party'] = r.id === 'customer-statement' ? 'CUSTOMER' : 'SUPPLIER';
        filters['id'] = party.id;
      }
      return { id: r.id, filters, business: this.business.businessId(), branch: this.business.branchId() };
    },
    loader: ({ request }): Observable<{ id: ReportId; value: unknown } | null> =>
      this.api.get<unknown>(PATHS[request.id], request.filters).pipe(
        map((value) => ({ id: request.id, value })),
        catchError((e) => {
          this.notify.error(e);
          return of(null);
        }),
      ),
  });

  // The loaded report, typed by what it is (null while another one loads).
  private of<T>(...ids: ReportId[]): T | null {
    const d = this.data.value();
    return d && ids.includes(d.id) && d.id === this.report()?.id ? (d.value as T) : null;
  }
  protected readonly sales = computed(() => this.of<SalesReport>('sales', 'gross-profit'));
  protected readonly profit = computed(() => this.of<ProfitReport>('profit'));
  protected readonly customerDebt = computed(() => this.of<CustomerDebtReport>('customer-debt'));
  protected readonly supplierDebt = computed(() => this.of<SupplierDebtReport>('supplier-debt'));
  protected readonly onHand = computed(() => this.of<OnHandReport>('stock-on-hand'));
  protected readonly reorder = computed(() => this.of<ReorderReport>('reorder'));
  /** A purchase order from the reorder suggestions (FR-2.12): the suggested quantity at the last cost. */
  protected readonly canOrder = computed(() => this.business.can('purchase_order:manage'));
  protected readonly orderLines = signal<DocLine[] | null>(null);
  protected readonly orderOpen = signal(false);
  protected readonly orderBusy = signal(false);
  protected readonly expiry = computed(() => this.of<ExpiryReport>('expiry'));
  protected readonly counts = computed(() => this.of<CountReport>('count-differences'));
  protected readonly abc = computed(() => this.of<AbcReport>('abc'));
  protected readonly eoq = computed(() => this.of<EoqReport>('eoq'));
  protected readonly losses = computed(() => this.of<LossReport>('losses'));
  protected readonly slow = computed(() => this.of<SlowReport>('slow-moving'));
  protected readonly shifts = computed(() => this.of<ShiftReport>('cash-shifts'));
  protected readonly vat = computed(() => this.of<VatReport>('vat'));
  protected readonly purchases = computed(() => this.of<PurchaseReport>('purchases'));
  protected readonly statement = computed(() => this.of<Statement>('customer-statement', 'supplier-statement'));

  // Excel and print (FR-5.7): from what the report shows, every row of it. Excel is in the Basic and Pro plans.
  private readonly body = viewChild<ElementRef<HTMLElement>>('reportBody');
  /** Every row on the page (no paging) while exporting or printing. */
  protected readonly full = signal(false);
  private readonly features = rxResource({
    request: () => this.business.businessId() ?? undefined,
    loader: () => this.api.get<Record<string, boolean>>('/business/features').pipe(catchError(() => of({} as Record<string, boolean>))),
  });
  protected readonly canExport = computed(() => !!this.features.value()?.['excel_export']);
  protected readonly ready = computed(() => !!this.data.value() && !this.data.isLoading());

  /**
   * Sales by day as bars, every day of the period (days without sales at zero, so the chart reads as a timeline);
   * other groupings show a share bar in the table instead.
   */
  protected readonly dayPoints = computed<BarPoint[]>(() => {
    const s = this.sales();
    if (!s || s.by !== 'DAY') {
      return [];
    }
    const byDay = new Map(s.rows.map((r) => [r.key, r]));
    const sold = this.translate.instant('reports.documentsN', { n: '' }).trim();
    const points: BarPoint[] = [];
    for (let date = new Date(s.from + 'T00:00:00'), end = new Date(s.to + 'T00:00:00'); date <= end; date.setDate(date.getDate() + 1)) {
      const key = toIsoDate(date)!;
      const row = byDay.get(key);
      const label = `${date.getDate()}/${date.getMonth() + 1}`;
      const sales = row?.sales ?? 0;
      points.push({ key, label, value: sales, tip: `${label}: ${USD.format(sales)} · ${row?.documents ?? 0} ${sold}` });
    }
    return points;
  });
  protected readonly salesMax = computed(() => Math.max(1, ...(this.sales()?.rows ?? []).map((r) => r.sales)));
  protected readonly money = (v: number) => USD_SHORT.format(v);
  /** Riel with the sign in front: −៛47,925. */
  protected readonly riel = (v: number) => (v < 0 ? '−' : '') + '៛' + Math.abs(Math.round(v)).toLocaleString('en-US');

  /** Today's rate, to show a USD total in riel too. */
  protected readonly rate = computed(() => this.business.rate()?.usdToKhr ?? null);

  constructor() {
    this.catalog.loadLists();
  }

  protected findParty(event: AutoCompleteCompleteEvent): void {
    const path = this.report()?.id === 'supplier-statement' ? '/suppliers' : '/customers';
    this.api.page<Party>(path, { page: 0, size: 10 }, { q: event.query }).subscribe({ next: (p) => this.parties.set(p.content) });
  }

  protected async exportExcel(): Promise<void> {
    const r = this.report();
    if (r && this.canExport()) {
      await this.withEveryRow((el) => exportReport(el, this.meta(), `${r.id}-${toIsoDate(new Date())}.xlsx`));
    }
  }

  protected async print(): Promise<void> {
    await this.withEveryRow((el) => printReport(el, this.meta()));
  }

  private async withEveryRow(run: (el: HTMLElement) => Promise<void> | void): Promise<void> {
    const el = this.body()?.nativeElement;
    if (!el) {
      return;
    }
    this.full.set(true);
    await new Promise((resolve) => setTimeout(resolve, 50)); // the tables draw every row
    try {
      await run(el);
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.full.set(false);
    }
  }

  /** The heading of an exported or printed report: what, whose, which branch and period, and when. */
  private meta(): ReportMeta {
    const r = this.report()!;
    const t = (key: string, params?: object) => this.translate.instant(key, params);
    const b = this.business.current();
    const branch = this.business.branches().find((x) => x.id === this.business.branchId());
    const day = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    const statement = this.statement();
    return {
      title: t('reports.name.' + r.id) + (statement ? ` · ${statement.name}` : ''),
      lines: [
        b ? this.lang.name(b.nameEn, b.nameKm) : '',
        branch ? this.lang.name(branch.nameEn, branch.nameKm) : t('reports.allBranches'),
        ...(r.period ? [`${day(this.from())} – ${day(this.to())}`] : []),
        t('reports.printedOn', { date: day(new Date()) }),
      ].filter(Boolean),
    };
  }

  protected pick(id: ReportId): void {
    this.router.navigate([], { queryParams: { r: id, by: null }, queryParamsHandling: 'merge' });
  }

  protected setBy(by: SalesBy): void {
    this.router.navigate([], { queryParams: { by }, queryParamsHandling: 'merge' });
  }

  protected setFrom(d: Date | null): void {
    if (d) {
      this.from.set(d);
    }
  }

  protected setTo(d: Date | null): void {
    if (d) {
      this.to.set(d);
    }
  }

  /** A sales row's name: the day, a product, category, branch or cashier (none = "No category"...). */
  protected rowLabel(row: SalesReport['rows'][number], by: SalesBy): string {
    if (by === 'DAY') {
      return row.key;
    }
    return row.label ? this.lang.name(row.label, row.labelKm) : this.translate.instant('reports.none.' + by);
  }

  /** Reorder points are recalculated every morning; after an import or a big change, now (product:manage). */
  protected readonly canRecalc = computed(() => this.business.can('product:manage'));
  protected readonly recalcBusy = signal(false);

  protected recalculate(): void {
    this.recalcBusy.set(true);
    this.api.post<{ products: number }>('/stock/reorder-points/recalculate').subscribe({
      next: (r) => {
        this.recalcBusy.set(false);
        this.notify.showKey('reports.recalculated', { n: r.products });
        this.data.reload();
      },
      error: (e) => {
        this.recalcBusy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected createOrder(report: ReorderReport): void {
    const rows = report.rows.filter((r) => r.suggestedQty > 0);
    if (!rows.length) {
      return;
    }
    this.orderBusy.set(true);
    forkJoin(rows.map((r) => this.api.get<Product>(`/products/${r.productId}`))).subscribe({
      next: (products) => {
        this.orderBusy.set(false);
        this.orderLines.set(products.map((product, i) => ({
          product, unitId: null, qty: rows[i].suggestedQty, unitCost: rows[i].lastCost ?? product.avgCost ?? null, batchNo: '', expiryDate: null,
        })));
        this.orderOpen.set(true);
      },
      error: (e) => {
        this.orderBusy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected orderSaved(): void {
    this.router.navigate(['/suppliers/transactions']);
  }
}

const SALES_BY: SalesBy[] = ['DAY', 'PRODUCT', 'CATEGORY', 'BRANCH', 'CASHIER'];
const GROSS_BY: SalesBy[] = ['PRODUCT', 'CATEGORY', 'BRANCH'];

function defaultFrom(period: 'days30' | 'days90' | 'month' | 'year'): Date {
  const d = new Date();
  if (period === 'month') {
    d.setDate(1);
  } else if (period === 'year') {
    d.setFullYear(d.getFullYear() - 1);
    d.setDate(d.getDate() + 1);
  } else if (period === 'days90') {
    d.setDate(d.getDate() - 89);
  } else {
    d.setDate(d.getDate() - 29);
  }
  return d;
}
