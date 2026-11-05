import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';
import { FieldLabel } from '../../shared/field-label/field-label';

interface TransferRow {
  id: number;
  businessId: number;
  businessName: string;
  invoiceNumber: string;
  description: string | null;
  amount: number;
  bank: string;
  reference: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Bank transfers (FR-8.6, FR-10.14): the Owner's screenshot of a transfer for a billing invoice. Approving pays the
 * invoice; rejecting keeps it open and shows the Owner why. The screenshot is private, so it is fetched with the
 * admin's token and shown from memory.
 */
@Component({
  selector: 'ms-admin-transfers',
  imports: [FormsModule, TranslatePipe, DatePipe, CurrencyPipe, TableModule, Dialog, InputText, SelectButton, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './admin-transfers.html',
  styleUrls: ['../admin-tab.scss', './admin-transfers.scss'],
})
export class AdminTransfers {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotifyService);

  protected readonly filters = [
    { value: 'PENDING', label: 'admin.transfer.waiting' },
    { value: 'ALL', label: 'admin.transfer.all' },
  ];
  protected readonly filter = signal<'PENDING' | 'ALL'>('PENDING');
  protected readonly rows = signal<TransferRow[]>([]);
  protected readonly loading = signal(true);
  /** The transfer being looked at, and its screenshot as an object URL. */
  protected readonly open = signal<TransferRow | null>(null);
  protected readonly image = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => this.dropImage());
  }

  protected setFilter(value: 'PENDING' | 'ALL'): void {
    this.filter.set(value);
    this.load();
  }

  protected view(row: TransferRow): void {
    this.dropImage();
    this.reason.set('');
    this.open.set(row);
    this.http.get(`${environment.apiUrl}/admin/transfers/${row.id}/proof`, { responseType: 'blob' }).subscribe({
      next: (blob) => this.image.set(URL.createObjectURL(blob)),
      error: () => this.image.set(null),
    });
  }

  protected review(approve: boolean): void {
    const row = this.open();
    if (!row) {
      return;
    }
    this.busy.set(true);
    const call = approve
      ? this.api.post(`/admin/transfers/${row.id}/approve`)
      : this.api.post(`/admin/transfers/${row.id}/reject`, { reason: this.reason().trim() || null });
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey(approve ? 'admin.transfer.approved' : 'admin.transfer.rejected');
        this.close();
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected close(): void {
    this.open.set(null);
    this.dropImage();
  }

  private dropImage(): void {
    const url = this.image();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.image.set(null);
  }

  private load(): void {
    this.loading.set(true);
    this.api.get<TransferRow[]>('/admin/transfers', { status: this.filter() }).subscribe({
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
