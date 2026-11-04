import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';

import { ApiService } from '../../../core/api/api.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { ExpenseCategory } from '../expenses-page/expenses-page';

/** Expense categories (prototype expense-categories.html): add, rename, delete (switched off when in use). */
@Component({
  selector: 'ms-expense-categories-page',
  imports: [FormsModule, TranslatePipe, TableModule, Dialog, InputText, ButtonDirective, ButtonIcon, ButtonLabel, Tooltip, FieldLabel],
  templateUrl: './expense-categories-page.html',
  styleUrl: './expense-categories-page.scss',
})
export class ExpenseCategoriesPage {
  private readonly api = inject(ApiService);
  protected readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly categories = signal<ExpenseCategory[]>([]);
  protected readonly editing = signal<ExpenseCategory | null>(null);
  protected readonly open = signal(false);
  protected readonly nameEn = signal('');
  protected readonly nameKm = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.api.get<ExpenseCategory[]>('/expense-categories').subscribe({ next: (c) => this.categories.set(c), error: (e) => this.notify.error(e) });
  }

  protected edit(c: ExpenseCategory | null): void {
    this.editing.set(c);
    this.nameEn.set(c?.nameEn ?? '');
    this.nameKm.set(c?.nameKm ?? '');
    this.open.set(true);
  }

  protected save(): void {
    const name = this.nameEn().trim();
    if (!name) {
      return;
    }
    const c = this.editing();
    const body = { nameEn: name, nameKm: this.nameKm().trim() || null, active: true };
    (c ? this.api.put(`/expense-categories/${c.id}`, body) : this.api.post('/expense-categories', body)).subscribe({
      next: () => {
        this.open.set(false);
        this.notify.showKey('common.saved');
        this.load();
      },
      error: (e) => this.notify.error(e),
    });
  }

  protected remove(c: ExpenseCategory): void {
    this.confirm.confirm({
      header: this.translate.instant('common.delete'),
      message: this.translate.instant('expenses.deleteCategoryConfirm', { name: this.lang.name(c.nameEn, c.nameKm) }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => this.api.delete(`/expense-categories/${c.id}`).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) }),
    });
  }
}
