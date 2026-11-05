import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';

interface MessageRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  language: string;
  status: 'NEW' | 'READ' | 'DONE';
  createdAt: string;
}

/** Contact messages from the website (FR-8.4): newest first, marked read or done. */
@Component({
  selector: 'ms-admin-messages',
  imports: [FormsModule, TranslatePipe, DatePipe, SelectButton, ButtonDirective, ButtonLabel],
  templateUrl: './admin-messages.html',
  styleUrls: ['../admin-tab.scss', './admin-messages.scss'],
})
export class AdminMessages {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly filters = [
    { value: 'NEW', label: 'admin.message.NEW' },
    { value: 'READ', label: 'admin.message.READ' },
    { value: 'DONE', label: 'admin.message.DONE' },
    { value: null, label: 'admin.transfer.all' },
  ];
  protected readonly filter = signal<string | null>('NEW');
  protected readonly rows = signal<MessageRow[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    this.load();
  }

  protected setFilter(value: string | null): void {
    this.filter.set(value);
    this.load();
  }

  protected mark(m: MessageRow, status: MessageRow['status']): void {
    this.api.post(`/admin/messages/${m.id}/status`, { status }).subscribe({
      next: () => this.load(),
      error: (e) => this.notify.error(e),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.get<MessageRow[]>('/admin/messages', { status: this.filter() }).subscribe({
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
