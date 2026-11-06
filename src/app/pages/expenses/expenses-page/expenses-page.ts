import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';

import { ApiService } from '../../../core/api/api.service';
import { Currency, PaymentMethod } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { DocPhotoDialog } from '../../../shared/doc-photo-dialog/doc-photo-dialog';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { LazyList } from '../../../shared/lazy-list';
import { exportList } from '../../../shared/list-export';

export interface ExpenseCategory {
  id: number;
  nameEn: string;
  nameKm: string | null;
  active: boolean;
}

interface Expense {
  id: number;
  number: string;
  categoryId: number;
  categoryName: string;
  expenseDate: string;
  method: PaymentMethod;
  currency: Currency;
  amount: number;
  amountUsd: number;
  reference: string | null;
  note: string | null;
  status: 'POSTED' | 'VOID';
  /** A photo of the receipt is kept (GET /expenses/{id}/photo). */
  hasPhoto: boolean;
}

/**
 * Expenses (prototype expenses.html, PLAIN.md 11.9): money paid out for rent, electricity, transport... for a period
 * (this month to start) and a category, with a dialog to record one and voiding from the list.
 */
@Component({
  selector: 'ms-expenses-page',
  imports: [
    FormsModule, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Select, SelectButton, DatePicker, Dialog,
    InputNumber, InputText, ButtonDirective, ButtonIcon, ButtonLabel, Tooltip, FieldLabel, DocPhotoDialog,
  ],
  templateUrl: './expenses-page.html',
  styleUrl: './expenses-page.scss',
})
export class ExpensesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly categories = signal<ExpenseCategory[]>([]);
  protected readonly categoryOptions = computed(() =>
    this.categories().filter((c) => c.active).map((c) => ({ value: c.id, label: this.lang.name(c.nameEn, c.nameKm) })),
  );
  protected readonly from = signal<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly to = signal<Date>(new Date());
  protected readonly categoryId = signal<number | null>(null);
  protected readonly list = new LazyList<Expense>(
    (q) =>
      this.api.page<Expense>('/expenses', q, { from: toIsoDate(this.from()), to: toIsoDate(this.to()), categoryId: this.categoryId() }),
    (e) => this.notify.error(e),
  );

  protected readonly exporting = signal(false);

  /** Every row of the list (its filters too) as an Excel file (PLAIN.md 12.2: Export on the right of every list). */
  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    this.exporting.set(true);
    try {
      await exportList<Expense>(
        (page, size) => this.api.page<Expense>('/expenses', { page, size }, { from: toIsoDate(this.from()), to: toIsoDate(this.to()), categoryId: this.categoryId() }),
        [
          { header: t('common.number'), value: (x) => x.number },
          { header: t('common.date'), value: (x) => x.expenseDate },
          { header: t('expenses.category'), value: (x) => x.categoryName },
          { header: t('common.method'), value: (x) => t('docs.methods.' + x.method) },
          { header: t('common.amount'), value: (x) => x.amount, format: '#,##0.##' },
          { header: t('common.currency'), value: (x) => x.currency },
          { header: 'USD', value: (x) => x.amountUsd, format: '#,##0.00' },
          { header: t('common.status'), value: (x) => t('docs.status.' + x.status) },
          { header: t('common.note'), value: (x) => x.note },
        ],
        'expenses',
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.exporting.set(false);
    }
  }
  protected readonly pageTotal = computed(() =>
    this.list.rows().filter((e) => e.status === 'POSTED').reduce((s, e) => s + e.amountUsd, 0),
  );

  /** The expense whose receipt photo is open. */
  protected readonly photoOf = signal<Expense | null>(null);
  protected readonly photoOpen = signal(false);

  // New expense dialog
  protected readonly formOpen = signal(false);
  protected readonly fCategory = signal<number | null>(null);
  protected readonly fDate = signal<Date>(new Date());
  protected readonly fAmount = signal<number | null>(null);
  protected readonly fCurrency = signal<Currency>('USD');
  protected readonly fMethod = signal<PaymentMethod>('CASH');
  protected readonly fReference = signal('');
  protected readonly fNote = signal('');
  protected readonly busy = signal(false);
  protected readonly currencies = [
    { value: 'USD', label: 'USD $' },
    { value: 'KHR', label: 'KHR ៛' },
  ];
  protected readonly methods = ['CASH', 'KHQR', 'BANK'].map((m) => ({ value: m, label: `docs.methods.${m}` }));

  constructor() {
    this.api.get<ExpenseCategory[]>('/expense-categories').subscribe({ next: (c) => this.categories.set(c), error: (e) => this.notify.error(e) });
  }

  protected setFrom(date: Date): void {
    this.from.set(date);
    this.list.reload();
  }

  protected setTo(date: Date): void {
    this.to.set(date);
    this.list.reload();
  }

  protected setCategory(id: number | null): void {
    this.categoryId.set(id);
    this.list.reload();
  }

  protected openForm(): void {
    this.fCategory.set(this.categoryOptions()[0]?.value ?? null);
    this.fDate.set(new Date());
    this.fAmount.set(null);
    this.fCurrency.set('USD');
    this.fMethod.set('CASH');
    this.fReference.set('');
    this.fNote.set('');
    this.formOpen.set(true);
  }

  protected save(): void {
    if (!this.fCategory() || !this.fAmount()) {
      return;
    }
    this.busy.set(true);
    this.api
      .post('/expenses', {
        branchId: this.business.branchId(),
        categoryId: this.fCategory(),
        expenseDate: toIsoDate(this.fDate()),
        method: this.fMethod(),
        currency: this.fCurrency(),
        amount: this.fAmount(),
        reference: this.fReference().trim() || null,
        note: this.fNote().trim() || null,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.notify.showKey('common.saved');
          this.list.reload();
        },
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }

  protected openPhoto(e: Expense): void {
    this.photoOf.set(e);
    this.photoOpen.set(true);
  }

  protected photoChanged(e: Expense, hasPhoto: boolean): void {
    this.list.rows.update((rows) => rows.map((r) => (r.id === e.id ? { ...r, hasPhoto } : r)));
    this.photoOf.set({ ...e, hasPhoto });
  }

  protected voidExpense(e: Expense): void {
    this.confirm.confirm({
      header: this.translate.instant('common.void'),
      message: this.translate.instant('expenses.voidConfirm', { number: e.number }),
      acceptLabel: this.translate.instant('common.void'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () =>
        this.api.post(`/expenses/${e.id}/void`).subscribe({
          next: () => {
            this.notify.showKey('expenses.voided');
            this.list.refresh();
          },
          error: (err) => this.notify.error(err),
        }),
    });
  }
}
