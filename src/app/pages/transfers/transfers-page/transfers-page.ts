import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { LazyList } from '../../../shared/lazy-list';
import { TransferForm } from '../transfer-form/transfer-form';

interface Transfer {
  id: number;
  number: string;
  kind: 'MOVE' | 'BRANCH';
  status: string;
  fromName: string;
  toName: string;
  sentAt: string | null;
  receivedAt: string | null;
  returnReason: string | null;
  carrierNote: string | null;
  note: string | null;
  shortLines: number;
  value: number | null;
  lines: { id: number; productName: string; unitSymbol: string; qty: number; qtyReceived: number | null; batchNo: string | null }[];
}

/**
 * Transfers (prototype transfers.html, PLAIN.md 11.3): moves between warehouses and transfers between branches, with
 * their status. From the document: move or send a draft, receive what arrived, or return it to the sender.
 */
@Component({
  selector: 'ms-transfers-page',
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Select, Drawer, ButtonDirective, ButtonIcon, ButtonLabel, TransferForm],
  templateUrl: './transfers-page.html',
  styleUrl: './transfers-page.scss',
})
export class TransfersPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);

  protected readonly status = signal<string | null>(null);
  protected readonly statuses = ['DRAFT', 'IN_TRANSIT', 'MOVED', 'RECEIVED', 'RETURNED'].map((s) => ({ value: s, label: `docs.status.${s}` }));
  protected readonly canManage = computed(() => this.business.can('transfer:manage'));
  protected readonly canReturn = computed(() => this.business.can('transfer:return_void'));
  protected readonly list = new LazyList<Transfer>(
    (query) => this.api.page<Transfer>('/transfers', query, { status: this.status() }),
    (e) => this.notify.error(e),
    'createdAt,desc',
  );
  protected readonly formOpen = signal(false);
  protected readonly viewing = signal<Transfer | null>(null);
  protected readonly busy = signal(false);

  protected setStatus(value: string | null): void {
    this.status.set(value);
    this.list.reload();
  }

  protected act(t: Transfer, action: 'move' | 'send' | 'receive' | 'return' | 'delete'): void {
    const call: Observable<Transfer | void> =
      action === 'delete'
        ? this.api.delete(`/transfers/${t.id}`)
        : action === 'return'
          ? this.api.post<Transfer>(`/transfers/${t.id}/return`, { reason: this.translate.instant('transfer.returnIt') })
          : this.api.post<Transfer>(`/transfers/${t.id}/${action}`);
    this.busy.set(true);
    call.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.viewing.set(updated ? (updated as Transfer) : null);
        this.notify.showKey('transfer.done');
        this.list.refresh();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
