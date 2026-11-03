import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslatePipe } from '@ngx-translate/core';

import { MyBusiness } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';

/** New business (prototype dlg-create). Closes with the new business; the setup page comes next. */
@Component({
  selector: 'ms-create-business-dialog',
  imports: [
    ReactiveFormsModule, TranslatePipe, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatFormField,
    MatLabel, MatError, MatInput, MatSelect, MatOption, MatButton, MatIconButton, MatIcon,
  ],
  templateUrl: './create-business-dialog.html',
  styleUrl: './create-business-dialog.scss',
})
export class CreateBusinessDialog {
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(MatDialogRef<CreateBusinessDialog, MyBusiness>);

  protected readonly types = ['MINI_MART', 'GROCERY', 'PHARMACY', 'COSMETICS', 'HARDWARE', 'PHONE_SHOP', 'WHOLESALE', 'OTHER'];
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    nameEn: ['', [Validators.required, Validators.maxLength(120)]],
    nameKm: ['', Validators.maxLength(120)],
    businessType: ['MINI_MART', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.business
      .create({ ...value, nameEn: value.nameEn.trim(), nameKm: value.nameKm.trim() || null, language: this.lang.lang() })
      .subscribe({
        next: (created) => this.ref.close(created),
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }
}
