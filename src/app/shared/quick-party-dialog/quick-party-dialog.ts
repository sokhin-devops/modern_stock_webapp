import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { Customer, Supplier } from '../../core/api/models';
import { NotifyService } from '../../core/notify.service';
import { FieldLabel } from '../field-label/field-label';
import { revealErrors } from '../forms';
import { CAMBODIAN_PHONE } from '../validators';

/**
 * Quick add from a picker (FR-3.17 for the POS): a new customer or supplier with only a name and a phone, enough to
 * pick them right away and, for a customer, to sell on credit (which needs a phone). What was typed in the picker's
 * search fills the matching field. The other details (terms, credit limit...) stay on the customer's or supplier's page.
 */
@Component({
  selector: 'ms-quick-party-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Dialog, InputText, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './quick-party-dialog.html',
})
export class QuickPartyDialog {
  readonly kind = input<'customer' | 'supplier'>('customer');
  readonly visible = model(false);
  /** What was typed in the search: a phone number or a name. */
  readonly typed = input('');
  readonly saved = output<Customer | Supplier>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly isCustomer = computed(() => this.kind() === 'customer');
  /** Unique ids, so two pickers on one screen don't share a form. */
  protected readonly formId = 'quick-party-' + Math.random().toString(36).slice(2, 8);
  protected readonly busy = signal(false);
  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        const typed = untracked(() => this.typed()).trim();
        const phone = /^[+\d][\d\s]*$/.test(typed);
        this.form.reset({ name: phone ? '' : typed, phone: phone ? typed : '' });
      }
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const v = this.form.getRawValue();
    const body = { name: v.name.trim(), phone: v.phone.trim() || null };
    const call: Observable<Customer | Supplier> = this.isCustomer()
      ? this.api.post<Customer>('/customers', { ...body, type: 'INDIVIDUAL' })
      : this.api.post<Supplier>('/suppliers', body);
    this.busy.set(true);
    call.subscribe({
      next: (p) => {
        this.busy.set(false);
        this.notify.showKey('pick.added', { name: p.name });
        this.saved.emit(p);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
