import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal, input, effect, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { Product } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { VoidService } from '../../../core/void.service';
import { CameraScanner } from '../../../shared/camera-scanner/camera-scanner';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { LazyList } from '../../../shared/lazy-list';
import { Option, warehouseOptions } from '../../../shared/options';
import { AttachButton } from '../../../shared/attach-button/attach-button';
import { exportList } from '../../../shared/list-export';
import { toIsoDate } from '../../../shared/dates';
import { PickField } from '../../../shared/pick/pick';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

interface CountLine {
  id: number;
  productId: number;
  productName: string;
  productNameKm: string | null;
  sku: string;
  unitSymbol: string;
  warehouseId: number;
  warehouseName: string;
  /** Empty in a blind count until it is submitted. */
  systemQty: number | null;
  countedQty: number | null;
  difference: number | null;
  value: number | null;
  /** Sold or received after the snapshot: count it again. */
  moved: boolean;
  /** Barcodes that count this product, and the base units one scan adds. */
  codes: { barcode: string; factor: number }[];
}

type CountStatus = 'DRAFT' | 'SUBMITTED' | 'POSTED' | 'VOID';
type CountScope = 'ALL' | 'CATEGORY' | 'PRODUCTS';

interface StockCount {
  id: number;
  number: string;
  branchId: number;
  /** null = every warehouse of the branch. */
  warehouseId: number | null;
  warehouseName: string;
  categoryId: number | null;
  scope: CountScope;
  blind: boolean;
  status: CountStatus;
  note: string | null;
  createdAt: string;
  submittedAt: string | null;
  postedAt: string | null;
  lineCount: number;
  counted: number;
  differences: number | null;
  differenceValue: number | null;
  /** Counted lines flagged for a recount. */
  moved: number;
  lines: CountLine[];
}

/**
 * Stock counts (prototype stock-counts.html / stock-count.html, PLAIN.md 11.2, FR-4.4, FR-4.9): count one warehouse or
 * all of a branch, every product, one category or the products of one shelf, openly or blind. Quantities are typed or
 * scanned (a USB scanner or the phone's camera). Products sold during the count are flagged and counted again. The
 * counter submits; Owner or Manager posts, and each difference changes the stock.
 */
@Component({
  selector: 'ms-counts-page',
  imports: [AttachButton, DatePicker,
    FormsModule, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Dialog, IconField, InputIcon,
    InputNumber, InputText, ProgressBar, Select, SelectButton, ToggleSwitch, PickField, ButtonDirective, ButtonIcon,
    ButtonLabel, FieldLabel, CameraScanner,
  ],
  templateUrl: './counts-page.html',
  styleUrl: './counts-page.scss',
})
export class CountsPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly catalog = inject(CatalogService);
  protected readonly lang = inject(LangService);
  protected readonly productName = (p: Product): string => this.lang.name(p.nameEn, p.nameKm);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly voids = inject(VoidService);

  // List filters (PLAIN.md 12.2): number, status, dates; Export on the right
  protected readonly fQ = signal('');
  protected readonly fStatus = signal<CountStatus | null>(null);
  protected readonly fFrom = signal<Date | null>(null);
  protected readonly fTo = signal<Date | null>(null);
  protected readonly statusOptions = (['DRAFT', 'SUBMITTED', 'POSTED', 'VOID'] as CountStatus[]).map((s) => ({ value: s, label: `counts.status.${s}` }));
  protected readonly exporting = signal(false);
  private readonly listSearch = new Subject<string>();
  protected readonly list = new LazyList<StockCount>((q) => this.api.page('/stock-counts', q, this.listFilters()), (e) => this.notify.error(e));

  protected onListSearch(value: string): void {
    this.listSearch.next(value);
  }

  protected setListFilter(key: 'status' | 'from' | 'to', value: CountStatus | Date | null): void {
    if (key === 'status') {
      this.fStatus.set(value as CountStatus | null);
    } else if (key === 'from') {
      this.fFrom.set(value as Date | null);
    } else {
      this.fTo.set(value as Date | null);
    }
    this.list.reload();
  }

  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    this.exporting.set(true);
    try {
      await exportList<StockCount>(
        (page, size) => this.api.page<StockCount>('/stock-counts', { page, size }, this.listFilters()),
        [
          { header: t('common.number'), value: (c) => c.number },
          { header: t('common.date'), value: (c) => (c.postedAt ?? c.submittedAt ?? c.createdAt)?.slice(0, 10) },
          { header: t('common.warehouse'), value: (c) => c.warehouseName },
          { header: t('counts.what'), value: (c) => this.scopeLabel(c) },
          { header: t('counts.counted'), value: (c) => `${c.counted} / ${c.lineCount}` },
          { header: t('counts.difference'), value: (c) => c.differenceValue, format: '#,##0.00' },
          { header: t('common.status'), value: (c) => t('counts.status.' + c.status) },
        ],
        'stock-counts',
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.exporting.set(false);
    }
  }

  private listFilters(): Record<string, string | null> {
    return { q: this.fQ() || null, status: this.fStatus(), from: toIsoDate(this.fFrom()), to: toIsoDate(this.fTo()) };
  }
  protected readonly canCount = computed(() => this.business.can('count:manage'));
  protected readonly canApprove = computed(() => this.business.can('adjustment:approve'));

  // Start dialog: "w:<id>" one warehouse, "b:<id>" every warehouse of a branch
  protected readonly places = computed<Option<string>[]>(() => {
    const branches = this.business.branches().filter((b) => b.active && (this.business.branchId() == null || b.id === this.business.branchId()));
    const warehouses = warehouseOptions(this.business.branches(), this.lang, this.business.branchId());
    return branches.flatMap((b) => {
      const own = b.warehouses.filter((w) => w.active).map((w) => w.id);
      const all: Option<string>[] = own.length > 1
        ? [{ value: `b:${b.id}`, label: this.translate.instant('counts.allWarehouses', { branch: this.lang.name(b.nameEn, b.nameKm) }) }]
        : [];
      return [...all, ...warehouses.filter((w) => own.includes(w.value)).map((w) => ({ value: `w:${w.value}`, label: w.label }))];
    });
  });
  protected readonly categories = computed(() =>
    this.catalog.categories().map((c) => ({ value: c.id, label: this.lang.name(c.nameEn, c.nameKm) })),
  );
  protected readonly scopes = [
    { value: 'ALL', label: 'counts.scopeAll' },
    { value: 'CATEGORY', label: 'counts.scopeCategory' },
    { value: 'PRODUCTS', label: 'counts.scopeProducts' },
  ];
  protected readonly startOpen = signal(false);
  protected readonly place = signal<string | null>(null);
  protected readonly scope = signal<CountScope>('ALL');
  protected readonly categoryId = signal<number | null>(null);
  protected readonly chosen = signal<Product[]>([]);
  protected readonly blind = signal(false);
  protected readonly canStart = computed(
    () =>
      !!this.place() &&
      (this.scope() !== 'CATEGORY' || this.categoryId() != null) &&
      (this.scope() !== 'PRODUCTS' || this.chosen().length > 0),
  );

  // The open count
  protected readonly count = signal<StockCount | null>(null);
  protected readonly filter = signal('');
  /** With several warehouses in one count, the one being counted now. */
  protected readonly warehouseId = signal<number | null>(null);
  protected readonly countWarehouses = computed(() => {
    const seen = new Map<number, string>();
    (this.count()?.lines ?? []).forEach((l) => seen.set(l.warehouseId, l.warehouseName));
    return [...seen].map(([value, label]) => ({ value, label }));
  });
  protected readonly shown = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const where = this.countWarehouses().length > 1 ? this.warehouseId() : null;
    return (this.count()?.lines ?? []).filter(
      (l) =>
        (where == null || l.warehouseId === where) &&
        (!q || [l.productName, l.productNameKm ?? '', l.sku].some((t) => t.toLowerCase().includes(q)) || l.codes.some((c) => c.barcode === q)),
    );
  });
  protected readonly progress = computed(() => {
    const lines = this.count()?.lines ?? [];
    return lines.length ? Math.round((lines.filter((l) => l.countedQty != null).length / lines.length) * 100) : 0;
  });
  protected readonly movedLines = computed(() => (this.count()?.lines ?? []).filter((l) => l.moved));
  /** Blind and still being counted: no system quantities to show. */
  protected readonly hidden = computed(() => !!this.count()?.blind && this.count()?.status === 'DRAFT');
  protected readonly editable = computed(() => this.count()?.status === 'DRAFT' && this.canCount());
  protected readonly busy = signal(false);

  // Scanning
  protected readonly code = signal('');
  protected readonly cameraOpen = signal(false);
  /** What the last scan did, shown under the scan field and the camera picture. */
  protected readonly scanned = signal<{ lineId: number | null; text: string } | null>(null);
  protected readonly hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices;

  /** ?open=<id>: a count opened from a notification or a link. */
  readonly openParam = input<string | undefined>(undefined, { alias: 'open' });

  constructor() {
    this.catalog.loadLists();
    effect(() => {
      const id = Number(this.openParam());
      if (id) {
        untracked(() => this.open({ id } as StockCount));
      }
    });
    this.listSearch.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef))).subscribe((q) => {
      this.fQ.set(q.trim());
      this.list.reload();
    });
  }

  protected scopeLabel(c: StockCount): string {
    if (c.scope === 'CATEGORY') {
      const cat = this.catalog.categories().find((x) => x.id === c.categoryId);
      return cat ? this.lang.name(cat.nameEn, cat.nameKm) : this.translate.instant('counts.scopeCategory');
    }
    return this.translate.instant(c.scope === 'PRODUCTS' ? 'counts.scopeProducts' : 'counts.scopeAll');
  }

  protected openStart(): void {
    this.place.set(this.places()[0]?.value ?? null);
    this.scope.set('ALL');
    this.categoryId.set(null);
    this.chosen.set([]);
    this.blind.set(false);
    this.startOpen.set(true);
  }

  protected start(): void {
    const [kind, id] = (this.place() ?? '').split(':');
    this.busy.set(true);
    this.api
      .post<StockCount>('/stock-counts', {
        warehouseId: kind === 'w' ? Number(id) : null,
        branchId: kind === 'b' ? Number(id) : null,
        categoryId: this.scope() === 'CATEGORY' ? this.categoryId() : null,
        productIds: this.scope() === 'PRODUCTS' ? this.chosen().map((p) => p.id) : null,
        blind: this.blind(),
      })
      .subscribe({
        next: (c) => {
          this.busy.set(false);
          this.startOpen.set(false);
          this.show(c);
          this.list.reload();
        },
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }

  protected open(c: StockCount): void {
    this.api.get<StockCount>(`/stock-counts/${c.id}`).subscribe({ next: (full) => this.show(full), error: (e) => this.notify.error(e) });
  }

  protected setCounted(line: CountLine, value: number | null): void {
    this.count.update((c) =>
      c
        ? {
            ...c,
            lines: c.lines.map((l) =>
              l.id === line.id ? { ...l, countedQty: value, difference: value == null || l.systemQty == null ? null : value - l.systemQty } : l,
            ),
          }
        : c,
    );
  }

  /** A scanned or typed barcode adds one of that unit (a carton adds its pieces) in the warehouse being counted. */
  protected scan(text: string): void {
    const code = text.trim();
    if (!code) {
      return;
    }
    const where = this.countWarehouses().length > 1 ? this.warehouseId() : null;
    let hit: { line: CountLine; factor: number } | null = null;
    for (const line of this.count()?.lines ?? []) {
      const match = line.codes.find((c) => c.barcode === code);
      if (match && (where == null || line.warehouseId === where)) {
        hit = { line, factor: match.factor };
        break;
      }
    }
    this.code.set('');
    if (!hit) {
      this.scanned.set({ lineId: null, text: this.translate.instant('counts.unknownCode', { code }) });
      return;
    }
    const total = (hit.line.countedQty ?? 0) + hit.factor;
    this.setCounted(hit.line, total);
    const name = this.lang.name(hit.line.productName, hit.line.productNameKm);
    this.scanned.set({ lineId: hit.line.id, text: `+${hit.factor} ${name} → ${total} ${hit.line.unitSymbol}` });
  }

  protected save(after?: () => void): void {
    const c = this.count();
    if (!c) {
      return;
    }
    this.busy.set(true);
    this.api
      .put<StockCount>(`/stock-counts/${c.id}/lines`, { lines: c.lines.map((l) => ({ itemId: l.id, countedQty: l.countedQty })) })
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.count.set(saved);
          if (after) {
            after();
          } else {
            this.notify.showKey('common.saved');
          }
          this.list.refresh();
        },
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }

  /** Takes the system quantity again for the products that moved, then they are counted again. */
  protected recount(): void {
    const c = this.count();
    if (c) {
      this.save(() => this.act(`/stock-counts/${c.id}/recount`, 'counts.recounted'));
    }
  }

  protected submit(): void {
    const c = this.count();
    if (c) {
      this.save(() => this.act(`/stock-counts/${c.id}/submit`, 'counts.submitted'));
    }
  }

  protected reopen(): void {
    const c = this.count();
    if (c) {
      this.act(`/stock-counts/${c.id}/reopen`, 'counts.reopened');
    }
  }

  protected post(): void {
    const c = this.count();
    if (!c) {
      return;
    }
    const post = () => this.act(`/stock-counts/${c.id}/post`, 'counts.posted');
    this.confirm.confirm({
      header: this.translate.instant('counts.post'),
      message: this.translate.instant('counts.postConfirm', { number: c.number }),
      acceptLabel: this.translate.instant('counts.post'),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: { text: true },
      accept: () => (c.status === 'DRAFT' ? this.save(post) : post()),
    });
  }

  /** A posted count that was wrong: its differences are undone (PLAIN.md 11.1); count again afterwards. */
  protected voidCount(): void {
    const c = this.count();
    if (!c) {
      return;
    }
    this.voids.void<StockCount>('count', `/stock-counts/${c.id}`, c.number, (v) => {
      this.count.set(v);
      this.list.refresh();
    }, (on) => this.busy.set(on));
  }

  protected remove(): void {
    const c = this.count();
    if (!c) {
      return;
    }
    this.api.delete(`/stock-counts/${c.id}`).subscribe({
      next: () => {
        this.count.set(null);
        this.list.reload();
      },
      error: (e) => this.notify.error(e),
    });
  }

  private act(path: string, done: string): void {
    this.busy.set(true);
    this.api.post<StockCount>(path).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.count.set(c);
        this.notify.showKey(done);
        this.list.refresh();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  private show(c: StockCount): void {
    this.filter.set('');
    this.code.set('');
    this.scanned.set(null);
    this.warehouseId.set(c.lines[0]?.warehouseId ?? null);
    this.count.set(c);
  }
}
