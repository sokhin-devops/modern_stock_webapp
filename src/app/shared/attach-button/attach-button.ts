import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';

import { ApiService } from '../../core/api/api.service';
import { DocPhotoDialog } from '../doc-photo-dialog/doc-photo-dialog';

/** The document kinds that keep a photo at /attachments/{type}/{id} (bills and expenses have their own). */
export type AttachType =
  | 'purchase-orders'
  | 'goods-receipts'
  | 'purchase-returns'
  | 'supplier-credits'
  | 'supplier-payments'
  | 'quotations'
  | 'sales-orders'
  | 'sales-receipts'
  | 'invoices'
  | 'deliveries'
  | 'payments-received'
  | 'sales-returns'
  | 'credit-notes'
  | 'adjustments'
  | 'transfers'
  | 'stock-counts';

/**
 * A document's photo or scan (PLAIN.md 11.1 rule 4): a button for the document's dialog footer that shows whether one
 * is kept, and opens it to see, add, change or remove it.
 */
@Component({
  selector: 'ms-attach-button',
  imports: [TranslatePipe, ButtonDirective, ButtonIcon, ButtonLabel, DocPhotoDialog],
  template: `
    <button pButton type="button" [outlined]="true" (click)="open.set(true)" [disabled]="hasPhoto() === null">
      <i class="pi" [class.pi-image]="hasPhoto()" [class.pi-paperclip]="!hasPhoto()" pButtonIcon></i>
      <span pButtonLabel>{{ (hasPhoto() ? 'attach.view' : 'attach.add') | translate }}</span>
    </button>
    <ms-doc-photo-dialog [(visible)]="open" [path]="'/attachments/' + type() + '/' + docId() + '/photo'" [hasPhoto]="!!hasPhoto()"
                         [header]="('attach.title' | translate) + ' · ' + number()" (changed)="hasPhoto.set($event)" />
  `,
})
export class AttachButton {
  readonly type = input.required<AttachType>();
  readonly docId = input.required<number>();
  readonly number = input('');

  private readonly api = inject(ApiService);

  /** null while asking the API. */
  protected readonly hasPhoto = signal<boolean | null>(null);
  protected readonly open = signal(false);

  constructor() {
    effect(() => {
      const path = `/attachments/${this.type()}/${this.docId()}`;
      untracked(() => {
        this.hasPhoto.set(null);
        this.api.get<{ hasPhoto: boolean }>(path).subscribe({
          next: (r) => this.hasPhoto.set(r.hasPhoto),
          error: () => this.hasPhoto.set(false),
        });
      });
    });
  }
}
