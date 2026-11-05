import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, input, model, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

import { Customer } from '../../../core/api/models';
import { LangService } from '../../../core/lang.service';

/** A cart put aside at the POS (FR-3.20), kept on this device until it is resumed or removed. */
export interface HeldSale {
  id: string;
  heldAt: string;
  customer: Customer | null;
  /** The cart lines as they were (see PosPage's CartLine). */
  lines: { product: { nameEn: string; nameKm: string | null }; qty: number; price: number }[];
}

/** The held sales, newest first: resume one to finish it, or remove it. */
@Component({
  selector: 'ms-held-dialog',
  imports: [TranslatePipe, CurrencyPipe, DatePipe, Dialog, ButtonDirective, ButtonIcon, ButtonLabel],
  templateUrl: './held-dialog.html',
  styleUrl: './held-dialog.scss',
})
export class HeldDialog {
  readonly visible = model(false);
  readonly sales = input<HeldSale[]>([]);
  readonly resume = output<HeldSale>();
  readonly remove = output<HeldSale>();

  protected readonly lang = inject(LangService);

  protected amount(h: HeldSale): number {
    return Math.round(h.lines.reduce((sum, l) => sum + l.qty * l.price, 0) * 100) / 100;
  }

  protected items(h: HeldSale): string {
    return h.lines.map((l) => this.lang.name(l.product.nameEn, l.product.nameKm)).join(', ');
  }
}
