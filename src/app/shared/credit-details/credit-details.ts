import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../core/api/api.service';
import { PageResponse } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
import { NotifyService } from '../../core/notify.service';
import { VoidService } from '../../core/void.service';
import { FieldLabel } from '../field-label/field-label';
import { Credit, CREDIT_KINDS, CreditKind, creditParty } from './credit';
import { AttachButton } from '../attach-button/attach-button';

/** An invoice or a bill that still has something to pay. */
interface OpenDoc {
  id: number;
  number: string;
  balance: number;
  status: string;
}

/**
 * One credit note or supplier credit: what it was for and what is left, and what to do with the rest: use it on an
 * open invoice (bill) of the same customer (supplier), or settle it in money.
 */
@Component({
  selector: 'ms-credit-details',
  imports: [NgTemplateOutlet, AttachButton, 
    FormsModule, TranslatePipe, CurrencyPipe, DatePipe, Dialog, Select, SelectButton, InputNumber, ButtonDirective, ButtonIcon,
    ButtonLabel, FieldLabel,
  ],
  templateUrl: './credit-details.html',
  styleUrl: './credit-details.scss',
})
export class CreditDetails {
  /** On a document's own page: no dialog, the content and actions in the page. */
  readonly inline = input(false);
  readonly kind = input.required<CreditKind>();
  readonly credit = model<Credit | null>(null);
  readonly changed = output<Credit>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly business = inject(BusinessService);
  private readonly voids = inject(VoidService);

  private readonly config = computed(() => CREDIT_KINDS[this.kind()]);
  protected readonly party = computed(() => (this.credit() ? creditParty(this.credit()!) : null));
  protected readonly canManage = computed(() => this.business.can(this.config().permission));
  protected readonly action = signal<'apply' | 'refund'>('apply');
  protected readonly docs = signal<OpenDoc[]>([]);
  protected readonly docId = signal<number | null>(null);
  protected readonly amount = signal<number | null>(null);
  protected readonly method = signal<'CASH' | 'KHQR' | 'BANK'>('CASH');
  protected readonly currency = signal<'USD' | 'KHR'>('USD');
  protected readonly busy = signal(false);

  protected readonly actions = computed(() => [
    ...(this.party()?.id ? [{ value: 'apply', label: `credits.${this.kind()}.useOn` }] : []),
    { value: 'refund', label: `credits.${this.kind()}.refund` },
  ]);
  protected readonly docOptions = computed(() =>
    this.docs().map((d) => ({ value: d.id, label: `${d.number} · $${d.balance.toFixed(2)}` })),
  );
  protected readonly methods = [
    { value: 'CASH', label: 'pos.cash' },
    { value: 'KHQR', label: 'pos.khqr' },
    { value: 'BANK', label: 'pos.bank' },
  ];
  protected readonly currencies = [
    { value: 'USD', label: 'USD' },
    { value: 'KHR', label: 'KHR' },
  ];

  /** The most that fits: what is left, and on a document, what it still owes. */
  protected readonly most = computed(() => {
    const left = this.credit()?.left ?? 0;
    if (this.action() === 'refund') {
      return left;
    }
    const doc = this.docs().find((d) => d.id === this.docId());
    return doc ? Math.min(left, doc.balance) : left;
  });

  /** A credit written by hand and not refunded can be voided; one from a return goes with its return (PLAIN.md 11.1). */
  protected readonly voidable = computed(() => {
    const c = this.credit();
    return !!c && this.canManage() && c.status !== 'VOID' && !c.refundedAmount && !c.salesReturnId && !c.purchaseReturnId;
  });

  constructor() {
    effect(() => {
      const c = this.credit();
      if (c) {
        untracked(() => this.prepare(c));
      }
    });
  }

  protected setAction(a: 'apply' | 'refund'): void {
    this.action.set(a);
    this.amount.set(this.most());
  }

  protected setDoc(id: number): void {
    this.docId.set(id);
    this.amount.set(this.most());
  }

  protected submit(): void {
    const c = this.credit();
    const amount = this.amount();
    if (!c || !amount || amount <= 0) {
      return;
    }
    const { path, docField } = this.config();
    const call = this.action() === 'apply'
      ? this.api.post<Credit>(`${path}/${c.id}/apply`, { [docField]: this.docId(), amount })
      : this.api.post<Credit>(`${path}/${c.id}/refund`, { method: this.method(), currency: this.currency(), amount });
    this.busy.set(true);
    call.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.notify.showKey(`credits.${this.kind()}.${this.action() === 'apply' ? 'applied' : 'refundDone'}`);
        this.changed.emit(updated);
        this.credit.set(updated);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  private prepare(c: Credit): void {
    const partyId = creditParty(c).id;
    this.docs.set([]);
    this.docId.set(null);
    this.action.set(partyId ? 'apply' : 'refund');
    this.amount.set(c.left);
    if (partyId && c.status === 'OPEN') {
      const { docs, partyField } = this.config();
      this.api.page<OpenDoc>(docs, { page: 0, size: 50 }, { [partyField]: partyId }).subscribe({
        next: (p: PageResponse<OpenDoc>) => {
          const open = p.content.filter((d) => d.balance > 0 && d.status !== 'VOID');
          this.docs.set(open);
          if (open.length) {
            this.docId.set(open[0].id);
          } else {
            this.action.set('refund');
          }
          this.amount.set(this.most());
        },
      });
    }
  }

  protected voidIt(c: Credit): void {
    const customer = this.kind() === 'customer';
    this.voids.void<Credit>(customer ? 'creditNote' : 'supplierCredit', `${this.config().path}/${c.id}`, c.number,
      (updated) => {
        this.changed.emit(updated);
        this.credit.set(updated);
      },
      (on) => this.busy.set(on));
  }
}
