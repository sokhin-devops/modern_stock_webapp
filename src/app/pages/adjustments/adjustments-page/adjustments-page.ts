import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { LazyList } from '../../../shared/lazy-list';
import { AdjustmentForm } from '../adjustment-form/adjustment-form';

interface Adjustment {
  id: number;
  number: string;
  warehouseName: string;
  kind: 'OPENING' | 'ADJUSTMENT';
  reason: string;
  status: string;
  postedAt: string | null;
  createdAt: string;
  note: string | null;
  totalValue: number | null;
  lines: { id: number; productName: string; batchNo: string | null; expiryDate: string | null; qtyChange: number; unitCost: number | null; value: number | null }[];
}

/**
 * Adjustments (prototype adjustments.html, PLAIN.md 11.2): opening stock and corrections, with their status. Requests
 * wait for a manager, who approves or rejects them from the document.
 */
@Component({
  selector: 'ms-adjustments-page',
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Select, Dialog, ButtonDirective, ButtonIcon, ButtonLabel, AdjustmentForm],
  templateUrl: './adjustments-page.html',
  styleUrl: './adjustments-page.scss',
})
export class AdjustmentsPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly status = signal<string | null>(null);
  protected readonly statuses = ['WAITING_APPROVAL', 'POSTED', 'REJECTED', 'VOID'].map((s) => ({ value: s, label: `docs.status.${s}` }));
  protected readonly canCreate = computed(() =>
    ['stock:opening', 'adjustment:post', 'adjustment:request'].some((p) => this.business.can(p)),
  );
  protected readonly canApprove = computed(() => this.business.can('adjustment:approve'));
  /** Voiding a posted adjustment (PLAIN.md 11.1): whoever posts adjustments, the Owner and Manager. */
  protected readonly canVoid = computed(() => this.business.can('adjustment:post'));
  protected readonly list = new LazyList<Adjustment>(
    (query) => this.api.page<Adjustment>('/adjustments', query, { status: this.status() }),
    (e) => this.notify.error(e),
    'createdAt,desc',
  );
  protected readonly formOpen = signal(false);
  protected readonly viewing = signal<Adjustment | null>(null);
  protected readonly busy = signal(false);

  protected setStatus(value: string | null): void {
    this.status.set(value);
    this.list.reload();
  }

  /** The opposite movements, back into the same batches; refused when what it added has been sold or moved since. */
  protected voidIt(a: Adjustment): void {
    this.confirm.confirm({
      header: this.translate.instant('adjust.void'),
      message: this.translate.instant('adjust.voidAsk', { number: a.number }),
      acceptLabel: this.translate.instant('adjust.void'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => {
        this.busy.set(true);
        this.api.post<Adjustment>(`/adjustments/${a.id}/void`).subscribe({
          next: (updated) => {
            this.busy.set(false);
            this.viewing.set(updated);
            this.notify.showKey('adjust.voided', { number: a.number });
            this.list.refresh();
          },
          error: (e) => {
            this.busy.set(false);
            this.notify.error(e);
          },
        });
      },
    });
  }

  protected decide(a: Adjustment, action: 'approve' | 'reject'): void {
    this.busy.set(true);
    this.api.post<Adjustment>(`/adjustments/${a.id}/${action}`).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.viewing.set(updated);
        this.notify.showKey(action === 'approve' ? 'adjust.approveDone' : 'adjust.rejectDone');
        this.list.refresh();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
