import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';

import { ApiService } from './api/api.service';
import { NotifyService } from './notify.service';

/** Which document is voided: picks the question that says what the void will undo. */
export type VoidKind =
  | 'invoice'
  | 'goodsReceipt'
  | 'bill'
  | 'supplierPayment'
  | 'paymentReceived'
  | 'salesReturn'
  | 'purchaseReturn'
  | 'creditNote'
  | 'supplierCredit'
  | 'count';

/**
 * Voiding a posted document (PLAIN.md 11.1 rule 3): asks first, saying what will be undone, then POSTs
 * `<path>/void`. The API refuses with a clear message while something depends on the document.
 */
@Injectable({ providedIn: 'root' })
export class VoidService {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly notify = inject(NotifyService);

  /** `path` is the document's own URL, for example `/invoices/12`. `done` gets the voided document back. */
  void<T>(kind: VoidKind, path: string, number: string, done: (doc: T) => void, busy?: (on: boolean) => void): void {
    const t = (key: string) => this.translate.instant(key, { number });
    this.confirm.confirm({
      header: t('voids.header'),
      message: t(`voids.ask.${kind}`),
      acceptLabel: t('voids.button'),
      rejectLabel: t('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => {
        busy?.(true);
        this.api.post<T>(`${path}/void`).subscribe({
          next: (doc) => {
            busy?.(false);
            this.notify.showKey('voids.done', { number });
            done(doc);
          },
          error: (e) => {
            busy?.(false);
            this.notify.error(e);
          },
        });
      },
    });
  }
}
