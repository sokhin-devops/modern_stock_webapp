import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, model, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

import { CheckoutResponse } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { ApiFilePipe } from '../../../shared/api-file.pipe';

/**
 * The finished sale as an 80 or 58 mm receipt (prototype receipt, PLAIN.md 11.4): shop, number and time, lines, totals in
 * dollars and riel, what was paid and the change. Print uses the browser (only the receipt prints).
 */
@Component({
  selector: 'ms-receipt-dialog',
  imports: [TranslatePipe, DecimalPipe, DatePipe, Dialog, ButtonDirective, ButtonIcon, ButtonLabel, ApiFilePipe],
  templateUrl: './receipt-dialog.html',
  styleUrl: './receipt-dialog.scss',
})
export class ReceiptDialog {
  readonly sale = input<CheckoutResponse | null>(null);
  readonly visible = model(false);
  /** The line at the bottom of the receipt (Settings: Tax and receipt). */
  readonly receiptFooter = input<string | null>(null);
  readonly receiptHeader = input<string | null>(null);
  /** Paper width in mm: 80 or 58. */
  readonly paper = input<58 | 80>(80);
  readonly showVatTin = input(true);
  readonly newSale = output<void>();

  private readonly business = inject(BusinessService);
  protected readonly shop = computed(() => this.business.current());
  protected readonly logo = computed(() => this.business.profile()?.logoUrl ?? null);
  protected readonly vatTin = computed(() => (this.showVatTin() ? (this.business.profile()?.vatTin ?? null) : null));
  protected readonly branch = computed(() => this.business.branch());
  protected readonly now = new Date();

  protected print(): void {
    window.print();
  }

  protected next(): void {
    this.visible.set(false);
    this.newSale.emit();
  }
}
