import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { BusinessSettings } from '../../../core/api/models';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';

interface Party {
  id: number;
  name: string;
  phone: string | null;
}

interface InvoiceRow {
  id: number;
  number: string;
  type: string;
  status: string;
  total: number;
}

/** Where a debit note starts from: an invoice opened on screen, or nothing (pick the customer). */
export interface DebitStart {
  customerId: number;
  customerName: string;
  invoiceId: number;
}

/** The note just saved (an invoice of type DEBIT_NOTE). */
export interface SavedDebit {
  id: number;
  number: string;
}

/**
 * A debit note (FR-3.19): the customer owes more after an invoice, e.g. a price corrected up or a delivery charge.
 * Whom, which invoice it adds to (optional), how much (with VAT when the business charges it), and why.
 */
@Component({
  selector: 'ms-debit-dialog',
  imports: [FormsModule, TranslatePipe, CurrencyPipe, Dialog, AutoComplete, InputNumber, InputText, Select, ToggleSwitch, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './debit-dialog.html',
})
export class DebitDialog {
  readonly visible = model(false);
  readonly start = input<DebitStart | null>(null);
  readonly saved = output<SavedDebit>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly party = signal<Party | null>(null);
  protected readonly parties = signal<Party[]>([]);
  protected readonly invoices = signal<InvoiceRow[]>([]);
  protected readonly invoiceId = signal<number | null>(null);
  protected readonly amount = signal<number | null>(null);
  protected readonly addVat = signal(false);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  /** VAT is on in Settings › Tax and receipt; its rate. */
  protected readonly vatRate = signal<number | null>(null);
  protected readonly vat = computed(() =>
    this.addVat() && this.vatRate() ? Math.round((this.amount() ?? 0) * this.vatRate()! + Number.EPSILON) / 100 : 0,
  );
  protected readonly total = computed(() => Math.round(((this.amount() ?? 0) + this.vat()) * 100) / 100);

  constructor() {
    effect(() => {
      if (this.visible()) {
        const start = this.start();
        untracked(() => {
          this.amount.set(null);
          this.reason.set('');
          this.invoices.set([]);
          this.invoiceId.set(null);
          this.party.set(start ? { id: start.customerId, name: start.customerName, phone: null } : null);
          if (start) {
            this.loadInvoices(start.customerId, start.invoiceId);
          }
          this.api.get<BusinessSettings>('/business/settings').subscribe({
            next: (s) => {
              this.vatRate.set(s.vatEnabled ? s.vatRate : null);
              this.addVat.set(s.vatEnabled);
            },
          });
        });
      }
    });
  }

  protected find(event: AutoCompleteCompleteEvent): void {
    this.api.page<Party>('/customers', { page: 0, size: 10 }, { q: event.query }).subscribe({ next: (p) => this.parties.set(p.content) });
  }

  protected pick(p: Party | null): void {
    this.party.set(p?.id ? p : null);
    this.invoices.set([]);
    this.invoiceId.set(null);
    if (p?.id) {
      this.loadInvoices(p.id, null);
    }
  }

  protected submit(): void {
    const party = this.party();
    const amount = this.amount();
    if (!party || !amount || amount <= 0 || !this.reason().trim()) {
      return;
    }
    this.busy.set(true);
    const body = { customerId: party.id, invoiceId: this.invoiceId(), amount, addVat: this.addVat(), reason: this.reason().trim() };
    this.api.post<SavedDebit>('/debit-notes', body).subscribe({
      next: (d) => {
        this.busy.set(false);
        this.notify.showKey('debit.created', { number: d.number });
        this.saved.emit(d);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  /** The customer's invoices it can add to (not voided, not other debit notes), newest first. */
  private loadInvoices(customerId: number, select: number | null): void {
    this.api.page<InvoiceRow>('/invoices', { page: 0, size: 50, sort: 'invoiceDate,desc' }, { customerId }).subscribe({
      next: (p) => {
        this.invoices.set(p.content.filter((i) => i.status !== 'VOID' && i.type !== 'DEBIT_NOTE'));
        this.invoiceId.set(select);
      },
    });
  }
}
