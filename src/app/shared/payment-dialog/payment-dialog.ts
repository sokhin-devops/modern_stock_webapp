import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../core/api/api.service';
import { BusinessSettings, Currency, PaymentMethod } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
import { NotifyService } from '../../core/notify.service';
import { FieldLabel } from '../field-label/field-label';

interface Party {
  id: number;
  name: string;
  balance: number;
}

/**
 * A payment from a customer (payments received) or to a supplier (PLAIN.md 11.7, 11.8): who, how much, in which
 * currency and how. The API pays the oldest open invoices or bills first; anything left is a deposit or an advance.
 */
@Component({
  selector: 'ms-payment-dialog',
  imports: [FormsModule, TranslatePipe, Dialog, AutoComplete, InputNumber, InputText, SelectButton, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './payment-dialog.html',
  styleUrl: './payment-dialog.scss',
})
export class PaymentDialog {
  readonly kind = input.required<'customer' | 'supplier'>();
  readonly visible = model(false);
  readonly saved = output<void>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);

  protected readonly party = signal<Party | null>(null);
  protected readonly parties = signal<Party[]>([]);
  protected readonly amount = signal<number | null>(null);
  protected readonly currency = signal<Currency>('USD');
  protected readonly method = signal<PaymentMethod>('CASH');
  protected readonly reference = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly isCustomer = computed(() => this.kind() === 'customer');
  protected readonly currencies = [
    { value: 'USD', label: 'USD $' },
    { value: 'KHR', label: 'KHR ៛' },
  ];
  /** Customers pay by the methods the business takes (Settings › Sales rules); payments to suppliers by any. */
  private readonly enabled = signal<{ khqr: boolean; bank: boolean }>({ khqr: true, bank: true });
  protected readonly methods = computed(() =>
    ['CASH', 'KHQR', 'BANK']
      .filter((m) => !this.isCustomer() || m === 'CASH' || (m === 'KHQR' ? this.enabled().khqr : this.enabled().bank))
      .map((m) => ({ value: m, label: `docs.methods.${m}` })),
  );

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.party.set(null);
        this.amount.set(null);
        this.currency.set('USD');
        this.method.set('CASH');
        this.reference.set('');
        this.note.set('');
        if (this.isCustomer()) {
          this.api.get<BusinessSettings>('/business/settings').subscribe({
            next: (s) => this.enabled.set({ khqr: s.khqrEnabled, bank: s.bankEnabled }),
          });
        }
      }
    });
  }

  protected find(event: AutoCompleteCompleteEvent): void {
    this.api
      .page<Party>(this.isCustomer() ? '/customers' : '/suppliers', { page: 0, size: 10 }, { q: event.query })
      .subscribe({ next: (p) => this.parties.set(p.content) });
  }

  /** Picking someone who owes (or is owed) fills in the whole balance. */
  protected pick(party: Party | null): void {
    this.party.set(party?.id ? party : null);
    if (party?.balance && party.balance > 0) {
      this.amount.set(party.balance);
      this.currency.set('USD');
    }
  }

  protected submit(): void {
    const party = this.party();
    const amount = this.amount();
    if (!party || !amount) {
      return;
    }
    const payment = { method: this.method(), currency: this.currency(), amount, reference: this.reference().trim() || null };
    const body = this.isCustomer()
      ? { customerId: party.id, branchId: this.business.branchId(), payment, allocations: [], note: this.note().trim() || null }
      : { supplierId: party.id, branchId: this.business.branchId(), payment, allocations: [], note: this.note().trim() || null };
    this.busy.set(true);
    this.api.post(this.isCustomer() ? '/payments-received' : '/supplier-payments', body).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey(this.isCustomer() ? 'sales.received' : 'purchase.payDone');
        this.saved.emit();
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
