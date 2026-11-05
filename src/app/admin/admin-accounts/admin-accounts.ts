import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';

interface AccountRow {
  id: number;
  fullName: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  status: 'UNVERIFIED' | 'ACTIVE' | 'DISABLED';
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  businesses: number;
  superAdmin: boolean;
}

/** Accounts (FR-8.1 to FR-8.3): who signed up and when; suspend, reactivate, or verify an email by hand. */
@Component({
  selector: 'ms-admin-accounts',
  imports: [TranslatePipe, DatePipe, TableModule, IconField, InputIcon, InputText, ButtonDirective, ButtonLabel],
  templateUrl: './admin-accounts.html',
  styleUrl: '../admin-tab.scss',
})
export class AdminAccounts {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly rows = signal<AccountRow[]>([]);
  protected readonly loading = signal(true);
  private readonly search = new Subject<string>();
  private q = '';

  constructor() {
    this.load();
    this.search.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef))).subscribe((q) => {
      this.q = q.trim();
      this.load();
    });
  }

  protected onSearch(value: string): void {
    this.search.next(value);
  }

  protected act(row: AccountRow, action: 'suspend' | 'reactivate' | 'verify'): void {
    this.confirm.confirm({
      header: row.fullName,
      message: this.translate.instant(`admin.account.${action}Ask`, { name: row.fullName }),
      acceptLabel: this.translate.instant('common.continue'),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: { text: true },
      accept: () =>
        this.api.post(`/admin/accounts/${row.id}/${action}`).subscribe({
          next: () => {
            this.notify.showKey('admin.done');
            this.load();
          },
          error: (e) => this.notify.error(e),
        }),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.get<AccountRow[]>('/admin/accounts', { q: this.q || null }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
  }
}
