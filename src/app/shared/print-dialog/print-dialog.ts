import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, ElementRef, computed, inject, input, model, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { ApiFilePipe } from '../api-file.pipe';
import { printCopy } from '../print-copy';

/** A document to print on A4: an invoice, a delivery note... Texts come translated, amounts formatted. */
export interface PrintDocument {
  /** Who issues it, when not the business itself (ModernStock on billing invoices); the business letterhead otherwise. */
  issuer?: { name: string; lines: string[] };
  title: string;
  number: string;
  date: string;
  /** Extra facts under the number ("Due 30/11/2026", "Invoice INV-0004"). */
  facts: { label: string; value: string }[];
  partyLabel: string;
  partyName: string;
  partyLines: string[];
  /** Columns after the product: quantity always; price and amount for money documents. */
  withPrices: boolean;
  /** Heading of the first column; "Product" by default. */
  itemLabel?: string;
  lines: { name: string; qty: number; unit: string; price?: number; total?: number }[];
  totals: { label: string; value: string; strong?: boolean }[];
  /** "Delivered by" and "Received by" lines to sign (delivery notes). */
  signatures: boolean;
  note?: string | null;
  /** A boxed line under the totals, e.g. "a proforma invoice is not a tax invoice". */
  notice?: string;
}

/**
 * Print preview of an A4 document with the business letterhead (logo, names, branch, phone, VAT TIN), and a Print
 * button. Only the document is printed (styles.scss @media print).
 */
@Component({
  selector: 'ms-print-dialog',
  imports: [TranslatePipe, DatePipe, DecimalPipe, Dialog, ButtonDirective, ButtonIcon, ButtonLabel, ApiFilePipe],
  templateUrl: './print-dialog.html',
  styleUrl: './print-dialog.scss',
})
export class PrintDialog {
  readonly doc = input<PrintDocument | null>(null);
  readonly visible = model(false);

  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);

  protected readonly profile = this.business.profile;
  protected readonly branch = computed(() => {
    const id = this.business.branchId();
    return this.business.branches().find((b) => b.id === id) ?? this.business.branches().find((b) => b.main) ?? null;
  });

  private readonly paperEl = viewChild<ElementRef<HTMLElement>>('paper');

  protected print(): void {
    const el = this.paperEl()?.nativeElement;
    if (el) {
      printCopy(el);
    }
  }
}
