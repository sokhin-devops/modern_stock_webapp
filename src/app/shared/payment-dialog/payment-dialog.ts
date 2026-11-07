import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Checkbox } from 'primeng/checkbox';
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
import { PickField } from '../pick/pick';

interface Party {
  id: number;
  name: string;
  balance: number;
}

/** An open invoice or bill of the party. */
interface OpenDoc {
  id: number;
  number: string;
  dueDate: string | null;
  balance: number;
  overdue: boolean;
  status: string;
}

/** A document chosen to pay, and how much of it (USD). */
interface Chosen {
  doc: OpenDoc;
  amount: number;
}

/**
 * A payment from a customer (payments received) or to a supplier (PLAIN.md 11.7, 11.8): who, how much, in which
 * currency and how. It pays the oldest open invoices or bills first, or the ones picked here (FR-3.22: one payment for
 * several documents, each fully or in part); anything left is a deposit or an advance.
 */
@Component({
  selector: 'ms-payment-dialog',
  imports: [
    FormsModule, TranslatePipe, CurrencyPipe, DatePipe, Dialog, PickField, Checkbox, InputNumber, InputText, SelectButton, ButtonDirective,
    ButtonLabel, FieldLabel,
  ],
  templateUrl: './payment-dialog.html',
  styleUrl: './payment-dialog.scss',
})
export class PaymentDialog {
  readonly kind = input.required<'customer' | 'supplier'>();
  readonly visible = model(false);
  /** Opened from a customer or supplier page: that party, already picked. */
  readonly preset = input<{ id: number; name: string; balance?: number } | null>(null);
  readonly saved = output<void>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);

  protected readonly party = signal<Party | null>(null);
  protected readonly amount = signal<number | null>(null);
  protected readonly currency = signal<Currency>('USD');
  protected readonly method = signal<PaymentMethod>('CASH');
  protected readonly reference = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly isCustomer = computed(() => this.kind() === 'customer');
  /** The party's open invoices or bills, oldest due first. */
  protected readonly openDocs = signal<OpenDoc[]>([]);
  protected readonly mode = signal<'oldest' | 'choose'>('oldest');
  protected readonly modes = [
    { value: 'oldest', label: 'payments.oldestFirst' },
    { value: 'choose', label: 'payments.choose' },
  ];
  protected readonly chosen = signal<Chosen[]>([]);
  protected readonly chosenTotal = computed(() => round2(this.chosen().reduce((s, c) => s + (c.amount || 0), 0)));
  /** The payment in USD, as the API counts it (riel at today's rate). */
  protected readonly amountUsd = computed(() => {
    const amount = this.amount() ?? 0;
    const rate = this.business.rate()?.usdToKhr;
    return this.currency() === 'USD' ? amount : rate ? round2(amount / rate) : 0;
  });
  /** The picked documents need more than the payment. */
  protected readonly overChosen = computed(() => this.mode() === 'choose' && this.chosenTotal() > this.amountUsd() + 0.004);
  protected readonly canSave = computed(
    () => !!this.party() && !!this.amount() && (this.mode() === 'oldest' || (this.chosen().length > 0 && !this.overChosen())),
  );
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
        this.openDocs.set([]);
        this.mode.set('oldest');
        this.chosen.set([]);
        const preset = untracked(() => this.preset());
        if (preset) {
          untracked(() => this.pick({ id: preset.id, name: preset.name, balance: preset.balance ?? 0 }));
        }
        if (this.isCustomer()) {
          this.api.get<BusinessSettings>('/business/settings').subscribe({
            next: (s) => this.enabled.set({ khqr: s.khqrEnabled, bank: s.bankEnabled }),
          });
        }
      }
    });
  }

  /** Picking someone who owes (or is owed) fills in the whole balance. */
  protected pick(party: Party | null): void {
    this.party.set(party?.id ? party : null);
    this.openDocs.set([]);
    this.chosen.set([]);
    this.mode.set('oldest');
    if (party?.balance && party.balance > 0) {
      this.amount.set(party.balance);
      this.currency.set('USD');
    }
    if (party?.id) {
      const path = this.isCustomer() ? '/invoices' : '/bills';
      const filter = this.isCustomer() ? { customerId: party.id } : { supplierId: party.id };
      this.api.page<OpenDoc>(path, { page: 0, size: 100, sort: 'dueDate,asc' }, filter).subscribe({
        next: (p) => this.openDocs.set(p.content.filter((d) => d.status === 'UNPAID' || d.status === 'PARTLY_PAID')),
      });
    }
  }

  protected isChosen(doc: OpenDoc): boolean {
    return this.chosen().some((c) => c.doc.id === doc.id);
  }

  protected chosenAmount(doc: OpenDoc): number | null {
    return this.chosen().find((c) => c.doc.id === doc.id)?.amount ?? null;
  }

  /** Ticking a document pays all of it; the amount follows (in USD). */
  protected toggle(doc: OpenDoc, on: boolean): void {
    this.chosen.update((list) => (on ? [...list, { doc, amount: doc.balance }] : list.filter((c) => c.doc.id !== doc.id)));
    this.followChosen();
  }

  protected setChosenAmount(doc: OpenDoc, amount: number | null): void {
    this.chosen.update((list) => list.map((c) => (c.doc.id === doc.id ? { ...c, amount: Math.min(amount ?? 0, doc.balance) } : c)));
    this.followChosen();
  }

  protected setMode(mode: 'oldest' | 'choose'): void {
    this.mode.set(mode);
    this.chosen.set([]);
  }

  private followChosen(): void {
    if (this.currency() === 'USD') {
      this.amount.set(this.chosenTotal() || null);
    }
  }

  protected submit(): void {
    const party = this.party();
    const amount = this.amount();
    if (!party || !amount) {
      return;
    }
    const payment = { method: this.method(), currency: this.currency(), amount, reference: this.reference().trim() || null };
    const allocations =
      this.mode() === 'choose' ? this.chosen().filter((c) => c.amount > 0).map((c) => ({ documentId: c.doc.id, amount: c.amount })) : [];
    const body = this.isCustomer()
      ? { customerId: party.id, branchId: this.business.branchId(), payment, allocations, note: this.note().trim() || null }
      : { supplierId: party.id, branchId: this.business.branchId(), payment, allocations, note: this.note().trim() || null };
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
