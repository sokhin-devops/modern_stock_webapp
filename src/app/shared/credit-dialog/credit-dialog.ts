import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';

import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';
import { Credit, CREDIT_KINDS, CreditKind } from '../credit-details/credit';
import { FieldLabel } from '../field-label/field-label';
import { PickField } from '../pick/pick';

interface Party {
  id: number;
  name: string;
  phone: string | null;
}

/** A credit note or supplier credit by hand, for a price correction: whom, how much, and why. */
@Component({
  selector: 'ms-credit-dialog',
  imports: [FormsModule, TranslatePipe, Dialog, PickField, InputNumber, InputText, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './credit-dialog.html',
})
export class CreditDialog {
  readonly kind = input.required<CreditKind>();
  readonly visible = model(false);
  /** Opened from a customer or supplier page: that party, already picked. */
  readonly preset = input<{ id: number; name: string } | null>(null);
  readonly saved = output<Credit>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly config = computed(() => CREDIT_KINDS[this.kind()]);
  protected readonly party = signal<Party | null>(null);
  protected readonly amount = signal<number | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      if (this.visible()) {
        const preset = untracked(() => this.preset());
        this.party.set(preset ? { id: preset.id, name: preset.name, phone: null } : null);
        this.amount.set(null);
        this.reason.set('');
      }
    });
  }

  protected pick(p: Party | null): void {
    this.party.set(p?.id ? p : null);
  }

  protected submit(): void {
    const party = this.party();
    const amount = this.amount();
    if (!party || !amount || amount <= 0 || !this.reason().trim()) {
      return;
    }
    const { path, partyField } = this.config();
    this.busy.set(true);
    this.api.post<Credit>(path, { [partyField]: party.id, amount, reason: this.reason().trim() }).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.notify.showKey(`credits.${this.kind()}.created`, { number: c.number });
        this.saved.emit(c);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
