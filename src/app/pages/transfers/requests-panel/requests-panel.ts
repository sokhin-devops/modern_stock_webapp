import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { LazyList } from '../../../shared/lazy-list';
import { RequestForm } from '../request-form/request-form';

interface StockRequest {
  id: number;
  number: string;
  status: 'OPEN' | 'FULFILLED' | 'DECLINED' | 'CANCELLED';
  fromBranchId: number;
  fromBranchName: string;
  toBranchId: number;
  toBranchName: string;
  neededBy: string | null;
  note: string | null;
  createdAt: string;
  requestedByName: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  declineReason: string | null;
  transferId: number | null;
  transferNumber: string | null;
  canFulfil: boolean;
  canCancel: boolean;
  lines: { productId: number; productName: string; productNameKm: string | null; unitSymbol: string; qty: number; baseQty: number; available: number }[];
}

/**
 * Transfer requests (FR-4.11), the second tab of Transfers: what my branches asked others for, and what others ask of
 * them. The branch asked makes the transfer (a draft, which then opens to check and send) or declines with a reason;
 * the branch that asked can cancel while it is open.
 */
@Component({
  selector: 'ms-requests-panel',
  imports: [
    FormsModule, TranslatePipe, DatePipe, DecimalPipe, TableModule, Select, Dialog, InputText, ButtonDirective, ButtonIcon, ButtonLabel,
    RequestForm,
  ],
  templateUrl: './requests-panel.html',
  styleUrl: './requests-panel.scss',
})
export class RequestsPanel {
  /** The new-request form, opened from the page header. */
  readonly formOpen = model(false);
  /** A transfer was made from a request: the page opens it. */
  readonly openTransfer = output<number>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly status = signal<string | null>('OPEN');
  protected readonly statuses = ['OPEN', 'FULFILLED', 'DECLINED', 'CANCELLED'].map((s) => ({ value: s, label: `requests.status.${s}` }));
  protected readonly list = new LazyList<StockRequest>(
    (query) => this.api.page<StockRequest>('/transfer-requests', query, { status: this.status() }),
    (e) => this.notify.error(e),
    'id,desc',
  );
  protected readonly viewing = signal<StockRequest | null>(null);
  protected readonly busy = signal(false);
  /** Declining: the reason being typed. */
  protected readonly declining = signal(false);
  protected readonly reason = signal('');
  /** The branches I work in, to tell "asked of us" from "we asked". */
  private readonly mine = computed(() => new Set(this.business.pickableBranches().map((b) => b.id)));

  protected setStatus(value: string | null): void {
    this.status.set(value);
    this.list.reload();
  }

  /** Asked of the branch selected in the top bar (or, on All, of my branches by another). */
  protected incoming(r: StockRequest): boolean {
    const selected = this.business.branchId();
    return selected ? r.fromBranchId === selected : this.mine().has(r.fromBranchId) && !this.mine().has(r.toBranchId);
  }

  protected branchName(id: number, fallback: string): string {
    const b = this.business.branches().find((x) => x.id === id);
    return b ? this.lang.name(b.nameEn, b.nameKm) : fallback;
  }

  protected productName(l: StockRequest['lines'][number]): string {
    return this.lang.name(l.productName, l.productNameKm);
  }

  protected open(r: StockRequest): void {
    this.declining.set(false);
    this.reason.set('');
    this.api.get<StockRequest>(`/transfer-requests/${r.id}`).subscribe({ next: (x) => this.viewing.set(x), error: (e) => this.notify.error(e) });
  }

  protected created(r: { id: number }): void {
    this.list.reload();
    this.open(r as StockRequest);
  }

  /** The draft transfer is made and opens on the Transfers tab, to check batches and send. */
  protected fulfil(r: StockRequest): void {
    this.run(this.api.post<StockRequest>(`/transfer-requests/${r.id}/transfer`, {}), 'requests.fulfilled', (x) => {
      this.viewing.set(null);
      if (x.transferId) {
        this.openTransfer.emit(x.transferId);
      }
    });
  }

  protected decline(r: StockRequest): void {
    if (!this.declining()) {
      this.declining.set(true);
      return;
    }
    const reason = this.reason().trim();
    if (!reason) {
      return;
    }
    this.run(this.api.post<StockRequest>(`/transfer-requests/${r.id}/decline`, { reason }), 'requests.declined', (x) => this.viewing.set(x));
  }

  protected cancel(r: StockRequest): void {
    this.confirm.confirm({
      header: this.translate.instant('requests.cancel'),
      message: this.translate.instant('requests.cancelAsk', { number: r.number }),
      acceptLabel: this.translate.instant('requests.cancel'),
      rejectLabel: this.translate.instant('common.back'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => this.run(this.api.post<StockRequest>(`/transfer-requests/${r.id}/cancel`, {}), 'requests.cancelled', (x) => this.viewing.set(x)),
    });
  }

  private run(call: Observable<StockRequest>, done: string, then: (r: StockRequest) => void): void {
    this.busy.set(true);
    call.subscribe({
      next: (r) => {
        this.busy.set(false);
        this.declining.set(false);
        this.notify.showKey(done, { number: r.number });
        this.list.refresh();
        then(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
