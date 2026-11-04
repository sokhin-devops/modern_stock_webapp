import { Component, effect, inject, input, model, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';

import { Unit } from '../../../core/api/models';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { revealErrors } from '../../../shared/forms';

/** Add or rename a unit of measure (prototype dlg-unit): Piece (pcs), Box (box), Kilogram (kg)... */
@Component({
  selector: 'ms-unit-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Dialog, InputText, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './unit-dialog.html',
  styleUrl: './unit-dialog.scss',
})
export class UnitDialog {
  readonly unit = input<Unit | null>(null);
  readonly visible = model(false);

  private readonly catalog = inject(CatalogService);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    nameEn: ['', [Validators.required, Validators.maxLength(60)]],
    nameKm: ['', Validators.maxLength(60)],
    symbol: ['', [Validators.required, Validators.maxLength(10)]],
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        const u = this.unit();
        this.form.reset({ nameEn: u?.nameEn ?? '', nameKm: u?.nameKm ?? '', symbol: u?.symbol ?? '' });
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.catalog
      .saveUnit(this.unit()?.id ?? null, { nameEn: v.nameEn.trim(), nameKm: v.nameKm.trim() || null, symbol: v.symbol.trim() })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.notify.showKey('common.saved');
          this.visible.set(false);
        },
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }
}
