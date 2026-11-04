import { Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';

import { Category } from '../../../core/api/models';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { revealErrors } from '../../../shared/forms';

/** Add or rename a category (prototype dlg-cat). A category can sit inside another one. */
@Component({
  selector: 'ms-category-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Dialog, InputText, Select, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './category-dialog.html',
  styleUrl: './category-dialog.scss',
})
export class CategoryDialog {
  readonly category = input<Category | null>(null);
  readonly visible = model(false);

  private readonly catalog = inject(CatalogService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  /** Any other category can be the parent. */
  protected readonly parents = computed(() =>
    this.catalog
      .categories()
      .filter((c) => c.id !== this.category()?.id)
      .map((c) => ({ value: c.id, label: this.lang.name(c.nameEn, c.nameKm) })),
  );
  protected readonly form = inject(NonNullableFormBuilder).group({
    nameEn: ['', [Validators.required, Validators.maxLength(120)]],
    nameKm: ['', Validators.maxLength(120)],
    parentId: [null as number | null],
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        const c = this.category();
        this.form.reset({ nameEn: c?.nameEn ?? '', nameKm: c?.nameKm ?? '', parentId: c?.parentId ?? null });
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
      .saveCategory(this.category()?.id ?? null, { nameEn: v.nameEn.trim(), nameKm: v.nameKm.trim() || null, parentId: v.parentId })
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
