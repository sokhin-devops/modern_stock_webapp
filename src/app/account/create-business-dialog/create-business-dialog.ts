import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';

import { MyBusiness } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';
import { FieldLabel } from '../../shared/field-label/field-label';
import { revealErrors } from '../../shared/forms';

const TYPES = ['MINI_MART', 'GROCERY', 'PHARMACY', 'COSMETICS', 'HARDWARE', 'PHONE_SHOP', 'WHOLESALE', 'OTHER'];

/**
 * New business (prototype dlg-create), opened with PrimeNG's DialogService (see Businesses). Closes with the new
 * business; the setup page comes next.
 */
@Component({
  selector: 'ms-create-business-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, InputText, Select, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './create-business-dialog.html',
  styleUrl: './create-business-dialog.scss',
})
export class CreateBusinessDialog {
  protected readonly ref = inject<DynamicDialogRef<CreateBusinessDialog>>(DynamicDialogRef);
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly translate = inject(TranslateService);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  /** Business types in the current language. */
  protected readonly types = computed(() => {
    this.lang.lang();
    return TYPES.map((value) => ({ value, label: this.translate.instant(`account.types.${value}`) }));
  });
  protected readonly form = inject(NonNullableFormBuilder).group({
    nameEn: ['', [Validators.required, Validators.maxLength(120)]],
    nameKm: ['', Validators.maxLength(120)],
    businessType: ['MINI_MART', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.business
      .create({ ...value, nameEn: value.nameEn.trim(), nameKm: value.nameKm.trim() || null, language: this.lang.lang() })
      .subscribe({
        next: (created: MyBusiness) => this.ref.close(created),
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }
}
