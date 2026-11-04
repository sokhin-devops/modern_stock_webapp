import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';

import { PaymentLine, PaymentMethod } from '../../../core/api/models';
import { FieldLabel } from '../../../shared/field-label/field-label';

/** What the cart shows on the receipt preview. */
export interface PreviewLine {
  name: string;
  qty: number;
  unitSymbol: string;
  total: number;
}

/**
 * Payment (prototype dlg-pay, PLAIN.md 11.6): the amount due in dollars and riel, then cash in either currency (with
 * quick amounts and the change in riel, rounded down to the riel step), KHQR, or a bank transfer. Emits the payment
 * lines for checkout; a walk-in customer must pay in full.
 */
@Component({
  selector: 'ms-pay-dialog',
  imports: [FormsModule, TranslatePipe, DecimalPipe, Dialog, SelectButton, InputNumber, InputText, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './pay-dialog.html',
  styleUrl: './pay-dialog.scss',
})
export class PayDialog {
  readonly visible = model(false);
  readonly total = input.required<number>();
  readonly totalKhr = input.required<number>();
  readonly rate = input.required<number>();
  readonly rielStep = input(100);
  /** With a customer the sale may be paid in part (the rest becomes an invoice). */
  readonly partialAllowed = input(false);
  readonly lines = input<PreviewLine[]>([]);
  readonly busy = input(false);
  readonly pay = output<PaymentLine[]>();

  protected readonly method = signal<PaymentMethod>('CASH');
  protected readonly usd = signal<number | null>(null);
  protected readonly khr = signal<number | null>(null);
  protected readonly reference = signal('');
  protected readonly methods = [
    { value: 'CASH', label: 'pos.cash' },
    { value: 'KHQR', label: 'pos.khqr' },
    { value: 'BANK', label: 'pos.bank' },
  ];
  protected readonly usdQuick = [1, 5, 10, 20];
  protected readonly khrQuick = [1000, 5000, 10000, 50000];

  /** Cash handed over, in riel. */
  protected readonly tenderedKhr = computed(() => Math.round((this.usd() ?? 0) * this.rate() + (this.khr() ?? 0)));
  /** Change in riel, rounded down to the riel step (never more than owed back). */
  protected readonly changeKhr = computed(() => {
    const over = this.tenderedKhr() - this.totalKhr();
    return over > 0 ? Math.floor(over / this.rielStep()) * this.rielStep() : 0;
  });
  protected readonly shortKhr = computed(() => Math.max(0, this.totalKhr() - this.tenderedKhr()));
  protected readonly canComplete = computed(() => {
    if (this.busy()) {
      return false;
    }
    if (this.method() !== 'CASH') {
      return true;
    }
    return this.partialAllowed() ? this.tenderedKhr() > 0 : this.shortKhr() === 0;
  });

  constructor() {
    // A fresh payment each time the dialog opens: the exact dollar amount, ready to change.
    effect(() => {
      if (this.visible()) {
        this.method.set('CASH');
        this.usd.set(null);
        this.khr.set(null);
        this.reference.set('');
      }
    });
  }

  protected addUsd(amount: number): void {
    this.usd.update((v) => Math.round(((v ?? 0) + amount) * 100) / 100);
  }

  protected addKhr(amount: number): void {
    this.khr.update((v) => (v ?? 0) + amount);
  }

  /** "Exact": the total in dollars, nothing in riel. */
  protected exact(): void {
    this.usd.set(this.total());
    this.khr.set(null);
  }

  protected complete(): void {
    if (!this.canComplete()) {
      return;
    }
    if (this.method() !== 'CASH') {
      this.pay.emit([{ method: this.method(), currency: 'USD', amount: this.total(), reference: this.reference().trim() || null }]);
      return;
    }
    const lines: PaymentLine[] = [];
    if (this.usd()) {
      lines.push({ method: 'CASH', currency: 'USD', amount: this.usd()! });
    }
    if (this.khr()) {
      lines.push({ method: 'CASH', currency: 'KHR', amount: this.khr()! });
    }
    this.pay.emit(lines);
  }
}
