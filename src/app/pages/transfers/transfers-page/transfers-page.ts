import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { LazyList } from '../../../shared/lazy-list';
import { RequestsPanel } from '../requests-panel/requests-panel';
import { TransferForm } from '../transfer-form/transfer-form';
import { AttachButton } from '../../../shared/attach-button/attach-button';
import { exportList } from '../../../shared/list-export';

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
  fromWarehouseId: number;
  toWarehouseId: number | null;
  toBranchId: number | null;
  lines: { id: number; productId: number; unitId: number | null; productName: string; unitSymbol: string; qty: number; qtyReceived: number | null; batchNo: string | null }[];
}

/**
 * Transfers (prototype transfers.html, PLAIN.md 11.3): moves between warehouses and transfers between branches, with
 * their status. From the document: move or send a draft, receive what arrived, or return it to the sender. A second tab
 * holds the transfer requests between branches (FR-4.11).
 */
/** Days in transit before a transfer is late (TransferService.LATE_DAYS in the API). */
const LATE_DAYS = 3;

@Component({
  selector: 'ms-transfers-page',
  imports: [AttachButton, FormsModule, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Select, Dialog, ButtonDirective, ButtonIcon, ButtonLabel, TransferForm,
    Tabs, TabList, Tab, TabPanels, TabPanel, RequestsPanel],
  templateUrl: './transfers-page.html',
  styleUrl: './transfers-page.scss',
})
export class TransfersPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);
  private readonly confirm = inject(ConfirmationService);

  /** ?view=requests from the alerts (FR-4.11). */
  readonly viewParam = input<string | undefined>(undefined, { alias: 'view' });
  protected readonly view = linkedSignal<'transfers' | 'requests'>(() => (this.viewParam() === 'requests' ? 'requests' : 'transfers'));
  protected readonly requestFormOpen = signal(false);
  /** ?status=IN_TRANSIT from the alerts. */
  readonly statusParam = input<string | undefined>(undefined, { alias: 'status' });
  protected readonly status = linkedSignal<string | null>(() => this.statusParam() ?? null);
  /** In transit for longer than this is late (FR-4.13, as the API's alert). */
  private readonly lateMs = LATE_DAYS * 24 * 3600_000;
  protected readonly statuses = ['DRAFT', 'IN_TRANSIT', 'MOVED', 'RECEIVED', 'RETURNED', 'VOID'].map((s) => ({ value: s, label: `docs.status.${s}` }));
  protected readonly canManage = computed(() => this.business.can('transfer:manage'));
  protected readonly canReturn = computed(() => this.business.can('transfer:return_void'));
  protected readonly list = new LazyList<Transfer>(
    (query) => this.api.page<Transfer>('/transfers', query, { status: this.status() }),
    (e) => this.notify.error(e),
    'createdAt,desc',
  );

  protected readonly exporting = signal(false);

  /** Every row of the list (its filters too) as an Excel file (PLAIN.md 12.2: Export on the right of every list). */
  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    this.exporting.set(true);
    try {
      await exportList<Transfer>(
        (page, size) => this.api.page<Transfer>('/transfers', { page, size }, { status: this.status() }),
        [
          { header: t('common.number'), value: (x) => x.number },
          { header: t('common.from'), value: (x) => x.fromName },
          { header: t('common.to'), value: (x) => x.toName },
          { header: t('common.date'), value: (x) => x.sentAt?.slice(0, 10) },
          { header: t('stock.value'), value: (x) => x.value, format: '#,##0.00' },
          { header: t('common.status'), value: (x) => t('docs.status.' + x.status) },
        ],
        'transfers',
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.exporting.set(false);
    }
  }
  protected readonly formOpen = signal(false);
  /** The draft being changed in the form (PLAIN.md 12.2: draft rows open their edit form). */
  protected readonly editingDraft = signal<Transfer | null>(null);

  protected openRow(t: Transfer): void {
    if (t.status === 'DRAFT' && this.canManage()) {
      this.editDraft(t);
    } else {
      this.viewing.set(t);
    }
  }

  protected editDraft(t: Transfer): void {
    this.viewing.set(null);
    this.editingDraft.set(t);
    this.formOpen.set(true);
  }

  protected newTransfer(): void {
    this.editingDraft.set(null);
    this.formOpen.set(true);
  }
  protected readonly viewing = signal<Transfer | null>(null);
  protected readonly busy = signal(false);

  /** A transfer made from a request: its draft opens here, to check and send. */
  protected showTransfer(id: number): void {
    this.view.set('transfers');
    this.list.reload();
    this.api.get<Transfer>(`/transfers/${id}`).subscribe({ next: (t) => this.viewing.set(t), error: (e) => this.notify.error(e) });
  }

  protected isLate(t: Transfer): boolean {
    return t.status === 'IN_TRANSIT' && !!t.sentAt && Date.now() - new Date(t.sentAt).getTime() > this.lateMs;
  }

  protected setStatus(value: string | null): void {
    this.status.set(value);
    this.list.reload();
  }

  /** A moved or received transfer back to its source (PLAIN.md 11.9), while the destination still has the goods. */
  protected voidIt(t: Transfer): void {
    this.confirm.confirm({
      header: this.translate.instant('transfer.void'),
      message: this.translate.instant('transfer.voidAsk', { number: t.number }),
      acceptLabel: this.translate.instant('transfer.void'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => this.act(t, 'void'),
    });
  }

  protected act(t: Transfer, action: 'move' | 'send' | 'receive' | 'return' | 'delete' | 'void'): void {
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
