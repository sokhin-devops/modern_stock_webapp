import { Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';

import { ApiService } from '../../../core/api/api.service';
import { Customer } from '../../../core/api/models';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { revealErrors } from '../../../shared/forms';
import { CAMBODIAN_PHONE } from '../../../shared/validators';

/**
 * A new customer from the POS (FR-3.17): a name and a phone, enough to sell to them now and to sell on credit (which
 * needs a phone). What was typed in the customer search fills the matching field. Credit limits stay with whoever
 * manages customers.
 */
@Component({
  selector: 'ms-new-customer-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Dialog, InputText, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './new-customer-dialog.html',
})
export class NewCustomerDialog {
  readonly visible = model(false);
  /** What the cashier typed in the customer search: a phone number or a name. */
  readonly typed = input('');
  readonly saved = output<Customer>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(NonNullableFormBuilder);

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
    this.busy.set(true);
    this.api.post<Customer>('/customers', { name: v.name.trim(), phone: v.phone.trim() || null, type: 'INDIVIDUAL' }).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.notify.showKey('pos.customerAdded', { name: c.name });
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
