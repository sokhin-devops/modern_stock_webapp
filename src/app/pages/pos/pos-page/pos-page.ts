import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Select } from 'primeng/select';
import { Tooltip } from 'primeng/tooltip';
import { Subject, debounceTime, switchMap } from 'rxjs';

import { BusinessSettings, CashShift, CheckoutResponse, Customer, PaymentLine, Product } from '../../../core/api/models';
import { AuthService } from '../../../core/auth/auth.service';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { PosService } from '../../../core/sales/pos.service';
import { ThemeModeService } from '../../../core/theme-mode.service';
import { AnnouncementBanner } from '../../../layout/announcement-banner/announcement-banner';
import { SwitchDialog } from '../switch-dialog/switch-dialog';
import { AccountMenu } from '../../../shared/account-menu/account-menu';
import { ApiFilePipe } from '../../../shared/api-file.pipe';
import { LangButton } from '../../../shared/lang-button/lang-button';
import { PayDialog, PreviewLine } from '../pay-dialog/pay-dialog';
import { ReceiptDialog } from '../receipt-dialog/receipt-dialog';
import { HeldDialog, HeldSale } from '../held-dialog/held-dialog';
import { NewCustomerDialog } from '../new-customer-dialog/new-customer-dialog';
import { ShiftDialog } from '../shift-dialog/shift-dialog';

/** One line of the cart: a product in one of its units. */
interface CartLine {
  product: Product;
  /** null = the stock unit. */
  unitId: number | null;
  unitSymbol: string;
  /** Stock units in one of this unit. */
  factor: number;
  /** Price of one of this unit, USD. */
  price: number;
  qty: number;
}

/**
 * Point of sale (prototype pos.html, PLAIN.md 11.4): a full screen of its own. Scan or tap products into the cart,
 * change units and quantities, pick a customer (needed to pay later), then pay in dollars, riel, KHQR or by bank, and
 * get the receipt. The cash shift is opened and closed from the header. Keys: F2 scan, F9 pay.
 */
@Component({
  selector: 'ms-pos-page',
  imports: [
    FormsModule, RouterLink, TranslatePipe, DecimalPipe, DatePipe, AutoComplete, Select, ButtonDirective, ButtonIcon,
    ButtonLabel, Tooltip, LangButton, AccountMenu, PayDialog, ReceiptDialog, ShiftDialog, NewCustomerDialog, HeldDialog, ApiFilePipe,
    AnnouncementBanner, SwitchDialog,
  ],
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './pos-page.html',
  styleUrl: './pos-page.scss',
})
export class PosPage {
  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  protected readonly theme = inject(ThemeModeService);
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly pos = inject(PosService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);
  private readonly scanInput = viewChild<ElementRef<HTMLInputElement>>('scan');

  protected readonly settings = signal<BusinessSettings | null>(null);
  protected readonly categories = this.catalog.categories;

  // Products to tap
  protected readonly query = signal('');
  protected readonly categoryId = signal<number | null>(null);
  protected readonly products = signal<Product[]>([]);
  private readonly search = new Subject<void>();

  // Cart
  protected readonly lines = signal<CartLine[]>([]);
  protected readonly customer = signal<Customer | null>(null);
  protected readonly customerResults = signal<Customer[]>([]);
  /** A new customer from here (FR-3.17), starting from what was typed in the search. */
  protected readonly canAddCustomer = computed(() => this.business.can('customer:create_pos') || this.business.can('customer:manage'));
  protected readonly customerTyped = signal('');
  protected readonly newCustomerOpen = signal(false);
  /** Sales put aside to serve the next customer (FR-3.20), kept on this device per business and branch. */
  protected readonly held = signal<HeldSale[]>([]);
  protected readonly heldOpen = signal(false);
  private readonly heldKey = computed(() => {
    const businessId = this.business.current()?.id;
    const branchId = this.business.branchId();
    return businessId != null && branchId != null ? `ms.pos.held.${businessId}.${branchId}` : null;
  });

  // Dialogs
  protected readonly payOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly sale = signal<CheckoutResponse | null>(null);
  protected readonly receiptOpen = signal(false);
  protected readonly shift = signal<CashShift | null>(null);
  protected readonly shiftOpen = signal(false);
  /** Products already warned about stock kept for sales orders, in this cart. */
  private readonly reservedWarned = new Set<number>();
  /** Switch cashier with a PIN (FR-6.19). */
  protected readonly switchOpen = signal(false);

  protected readonly branch = this.business.branch;
  protected readonly rate = computed(() => this.business.rate()?.usdToKhr ?? 0);
  protected readonly canShift = computed(() => this.business.can('cash_shift:own') || this.business.can('cash_shift:all'));
  protected readonly branchOptions = computed(() =>
    this.business.branches().map((b) => ({ value: b.id, label: this.lang.name(b.nameEn, b.nameKm) })),
  );

  protected readonly count = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));
  protected readonly subtotal = computed(() => round2(this.lines().reduce((sum, l) => sum + l.qty * l.price, 0)));
  /** VAT on the products that are not exempt, as the API will charge it (shown before saving). */
  protected readonly vat = computed(() => {
    const s = this.settings();
    if (!s?.vatEnabled) {
      return 0;
    }
    const taxable = this.lines().filter((l) => !l.product.vatExempt).reduce((sum, l) => sum + l.qty * l.price, 0);
    return round2((taxable * s.vatRate) / 100);
  });
  protected readonly total = computed(() => round2(this.subtotal() + this.vat()));
  /** The total in riel, rounded to the business's riel step (PLAIN.md 11.6). */
  protected readonly totalKhr = computed(() => {
    const step = this.settings()?.rielRounding ?? 100;
    return Math.round((this.total() * this.rate()) / step) * step;
  });
  protected readonly preview = computed<PreviewLine[]>(() =>
    this.lines().map((l) => ({
      name: this.lang.name(l.product.nameEn, l.product.nameKm),
      qty: l.qty,
      unitSymbol: l.unitSymbol,
      total: round2(l.qty * l.price),
    })),
  );

  constructor() {
    this.catalog.loadLists();
    this.pos.settings().subscribe({ next: (s) => this.settings.set(s), error: () => this.settings.set(null) });
    // The POS sells in one branch: with "All branches" selected, start in the main branch.
    if (this.business.branchId() == null && this.business.canPickBranch()) {
      const main = this.business.branches().find((b) => b.main) ?? this.business.branches()[0];
      if (main) {
        this.business.selectBranch(main.id);
      }
    }
    this.search
      .pipe(
        debounceTime(250),
        switchMap(() =>
          this.catalog.searchProducts({ page: 0, size: 60, sort: 'nameEn,asc', q: this.query().trim(), categoryId: this.categoryId() }),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe({ next: (page) => this.products.set(page.content), error: (e) => this.notify.error(e) });
    // Held sales belong to the business and branch on screen.
    effect(() => {
      const key = this.heldKey();
      untracked(() => this.held.set(readHeld(key)));
    });
    // Products (stock per branch) and my shift follow the branch.
    effect(() => {
      const branchId = this.business.branchId();
      untracked(() => {
        this.search.next();
        this.loadShift(branchId);
      });
    });
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    this.search.next();
  }

  protected setCategory(id: number | null): void {
    this.categoryId.set(id);
    this.search.next();
  }

  /** Enter in the scan box: a barcode adds its product; otherwise a single search result is added. */
  protected onScan(): void {
    const code = this.query().trim();
    if (!code) {
      return;
    }
    this.pos.barcode(code, this.business.branchId()).subscribe({
      next: (found) => {
        if (found) {
          const unit = found.product.units.find((u) => u.unitId === found.unitId);
          this.addLine(found.product, found.unitId && unit ? { unitId: found.unitId, symbol: unit.unitSymbol ?? '', factor: found.factor } : null, found.price);
          this.setQuery('');
        } else if (this.products().length === 1) {
          this.add(this.products()[0]);
          this.setQuery('');
        } else {
          this.notify.show(this.translate.instant('pos.notFound', { code }));
        }
      },
      error: (e) => this.notify.error(e),
    });
  }

  /** Tap on a tile: one stock unit of the product. */
  protected add(product: Product): void {
    this.addLine(product, null, product.sellPrice);
    this.focusScan();
  }

  protected changeQty(line: CartLine, delta: number): void {
    const qty = line.qty + delta;
    if (qty <= 0) {
      this.remove(line);
      return;
    }
    this.lines.update((list) => list.map((l) => (l === line ? { ...l, qty } : l)));
    if (delta > 0) {
      this.warnReserved(line.product);
    }
  }

  /**
   * Stock kept for sales orders (FR-3.21) may still be sold here, after a warning: once per product and cart, when the
   * cart takes more than what is free.
   */
  private warnReserved(product: Product): void {
    const reserved = product.qtyReserved ?? 0;
    if (reserved <= 0 || this.reservedWarned.has(product.id)) {
      return;
    }
    const inCart = this.lines().filter((l) => l.product.id === product.id).reduce((sum, l) => sum + l.qty * l.factor, 0);
    if (inCart > product.qtyOnHand - reserved) {
      this.reservedWarned.add(product.id);
      this.notify.showKey('pos.reservedWarn', { name: this.lang.name(product.nameEn, product.nameKm), n: reserved });
    }
  }

  protected remove(line: CartLine): void {
    this.lines.update((list) => list.filter((l) => l !== line));
  }

  protected clear(): void {
    this.reservedWarned.clear();
    this.lines.set([]);
    this.customer.set(null);
  }

  /** Puts the cart aside (with its customer) and starts an empty one for the next customer. */
  protected holdSale(): void {
    if (!this.lines().length) {
      return;
    }
    if (this.held().length >= HELD_MAX) {
      this.notify.showKey('pos.heldFull', { n: HELD_MAX });
      return;
    }
    this.saveHeld([this.asHeld(), ...this.held()]);
    this.clear();
    this.notify.showKey('pos.heldDone');
    this.focusScan();
  }

  /** Back to a held sale; the cart on screen, if any, is held in its place so nothing is lost. */
  protected resumeHeld(sale: HeldSale): void {
    const rest = this.held().filter((h) => h.id !== sale.id);
    this.saveHeld(this.lines().length ? [this.asHeld(), ...rest] : rest);
    this.lines.set(sale.lines as CartLine[]);
    this.customer.set(sale.customer);
    this.heldOpen.set(false);
    this.focusScan();
  }

  protected removeHeld(sale: HeldSale): void {
    this.saveHeld(this.held().filter((h) => h.id !== sale.id));
    if (!this.held().length) {
      this.heldOpen.set(false);
    }
  }

  private asHeld(): HeldSale {
    return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, heldAt: new Date().toISOString(),
      customer: this.customer(), lines: this.lines() };
  }

  private saveHeld(list: HeldSale[]): void {
    this.held.set(list);
    const key = this.heldKey();
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(list));
      } catch {
        // Private windows may refuse storage: the held sales then last until the page is closed.
      }
    }
  }

  /** The units a line can be sold in: the stock unit and the product's bigger units. */
  protected unitOptions(product: Product): { value: number | null; label: string }[] {
    return [
      { value: null, label: product.baseUnitSymbol },
      ...product.units.map((u) => ({ value: u.unitId, label: u.unitSymbol ?? '' })),
    ];
  }

  protected changeUnit(line: CartLine, unitId: number | null): void {
    const unit = line.product.units.find((u) => u.unitId === unitId);
    const factor = unit ? unit.factor : 1;
    const price = unit ? (unit.sellPrice ?? line.product.sellPrice * factor) : line.product.sellPrice;
    this.lines.update((list) =>
      list.map((l) =>
        l === line ? { ...l, unitId, unitSymbol: unit?.unitSymbol ?? line.product.baseUnitSymbol, factor, price: round4(price) } : l,
      ),
    );
  }

  protected findCustomers(event: AutoCompleteCompleteEvent): void {
    this.customerTyped.set(event.query);
    this.pos.customers(event.query).subscribe({ next: (page) => this.customerResults.set(page.content) });
  }

  protected openPay(): void {
    if (!this.lines().length) {
      return;
    }
    if (!this.rate()) {
      this.notify.showKey('pos.noRate');
      return;
    }
    this.payOpen.set(true);
  }

  /** "Later": the whole sale goes on the customer's account as an invoice. */
  protected payLater(): void {
    if (!this.customer()) {
      this.notify.showKey('pos.needCustomer');
      return;
    }
    this.checkout([]);
  }

  protected checkout(payments: PaymentLine[]): void {
    this.busy.set(true);
    this.pos
      .checkout({
        branchId: this.business.branchId(),
        customerId: this.customer()?.id ?? null,
        items: this.lines().map((l) => ({ productId: l.product.id, unitId: l.unitId, qty: l.qty })),
        payments,
      })
      .subscribe({
        next: (sale) => {
          this.busy.set(false);
          this.payOpen.set(false);
          this.sale.set(sale);
          this.receiptOpen.set(true);
          sale.warnings?.forEach((w) => this.notify.show(w));
        },
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }

  /** After the receipt: an empty cart and fresh stock numbers for the next customer. */
  protected nextSale(): void {
    this.clear();
    this.search.next();
    this.loadShift(this.business.branchId());
    this.focusScan();
  }

  protected selectBranch(id: number | null): void {
    this.business.selectBranch(id);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'F2') {
      event.preventDefault();
      this.focusScan();
    } else if (event.key === 'F9') {
      event.preventDefault();
      this.openPay();
    }
  }

  private addLine(product: Product, unit: { unitId: number; symbol: string; factor: number } | null, price: number): void {
    const unitId = unit?.unitId ?? null;
    const existing = this.lines().find((l) => l.product.id === product.id && l.unitId === unitId);
    if (existing) {
      this.changeQty(existing, 1);
    } else {
      this.lines.update((list) => [
        ...list,
        {
          product,
          unitId,
          unitSymbol: unit?.symbol ?? product.baseUnitSymbol,
          factor: unit?.factor ?? 1,
          price: round4(price),
          qty: 1,
        },
      ]);
      this.warnReserved(product);
    }
  }

  private loadShift(branchId: number | null): void {
    if (!this.canShift() || branchId == null) {
      this.shift.set(null);
      return;
    }
    this.pos.currentShift(branchId).subscribe({ next: (s) => this.shift.set(s), error: () => this.shift.set(null) });
  }

  private focusScan(): void {
    this.scanInput()?.nativeElement.focus();
  }
}

/** Held sales per device: enough for a busy counter, small enough to keep track of. */
const HELD_MAX = 10;

function readHeld(key: string | null): HeldSale[] {
  if (!key) {
    return [];
  }
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
