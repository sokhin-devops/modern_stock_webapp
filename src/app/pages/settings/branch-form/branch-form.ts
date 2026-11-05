import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Tooltip } from 'primeng/tooltip';

import { ApiService } from '../../../core/api/api.service';
import { Branch, Warehouse } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { revealErrors } from '../../../shared/forms';
import { CAMBODIAN_PHONE } from '../../../shared/validators';

/**
 * Add or edit a branch (prototype branches.html drawer) and its warehouses: rename them, say which one sells and
 * which one receives goods, add another (for example a back store), or switch one off.
 */
@Component({
  selector: 'ms-branch-form',
  imports: [ReactiveFormsModule, FormsModule, TranslatePipe, Dialog, InputText, Checkbox, ButtonDirective, ButtonIcon, ButtonLabel, Tooltip, FieldLabel],
  templateUrl: './branch-form.html',
  styleUrl: './branch-form.scss',
})
export class BranchForm {
  readonly branch = input<Branch | null>(null);
  readonly visible = model(false);
  readonly saved = output<void>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly busy = signal(false);
  protected readonly canManage = computed(() => this.business.can('business:manage'));
  /** Editable copies of the branch's warehouses. */
  protected readonly warehouses = signal<Warehouse[]>([]);
  protected readonly newWarehouse = signal('');
  protected readonly form = inject(NonNullableFormBuilder).group({
    code: ['', Validators.maxLength(20)],
    nameEn: ['', [Validators.required, Validators.maxLength(120)]],
    nameKm: ['', Validators.maxLength(120)],
    address: ['', Validators.maxLength(255)],
    phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
    province: ['', Validators.maxLength(60)],
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        const b = this.branch();
        this.form.reset({
          code: b?.code ?? '',
          nameEn: b?.nameEn ?? '',
          nameKm: b?.nameKm ?? '',
          address: b?.address ?? '',
          phone: b?.phone ?? '',
          province: b?.province ?? '',
        });
        this.warehouses.set((b?.warehouses ?? []).map((w) => ({ ...w })));
        this.newWarehouse.set('');
        if (this.canManage()) {
          this.form.enable();
        } else {
          this.form.disable();
        }
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const v = this.form.getRawValue();
    const body = {
      code: v.code.trim() || null,
      nameEn: v.nameEn.trim(),
      nameKm: v.nameKm.trim() || null,
      address: v.address.trim() || null,
      phone: v.phone.trim() || null,
      province: v.province.trim() || null,
    };
    const id = this.branch()?.id;
    this.busy.set(true);
    (id == null ? this.api.post('/branches', body) : this.api.put(`/branches/${id}`, body)).subscribe({
      next: () => this.done(),
      error: (e) => this.fail(e),
    });
  }

  /** Saves one warehouse row (name, sells, receives, active). */
  protected saveWarehouse(w: Warehouse): void {
    const branchId = this.branch()?.id;
    if (!branchId || !w.nameEn.trim()) {
      return;
    }
    this.api
      .put(`/branches/${branchId}/warehouses/${w.id}`, { nameEn: w.nameEn.trim(), nameKm: w.nameKm, sales: w.sales, receiving: w.receiving, active: w.active })
      .subscribe({
        next: () => {
          this.notify.showKey('common.saved');
          this.saved.emit();
        },
        error: (e) => this.notify.error(e),
      });
  }

  protected addWarehouse(): void {
    const branchId = this.branch()?.id;
    const name = this.newWarehouse().trim();
    if (!branchId || !name) {
      return;
    }
    this.api.post<Warehouse>(`/branches/${branchId}/warehouses`, { nameEn: name, nameKm: null, sales: false, receiving: false }).subscribe({
      next: (w) => {
        this.warehouses.update((list) => [...list, w]);
        this.newWarehouse.set('');
        this.saved.emit();
      },
      error: (e) => this.notify.error(e),
    });
  }

  protected deactivate(): void {
    const b = this.branch();
    if (!b) {
      return;
    }
    this.confirm.confirm({
      header: this.translate.instant('settings.branches.deactivate'),
      message: this.translate.instant('settings.branches.deactivateConfirm', { name: this.lang.name(b.nameEn, b.nameKm) }),
      acceptLabel: this.translate.instant('settings.branches.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => this.api.delete(`/branches/${b.id}`).subscribe({ next: () => this.done(), error: (e) => this.notify.error(e) }),
    });
  }

  private done(): void {
    this.busy.set(false);
    this.notify.showKey('common.saved');
    this.saved.emit();
    this.visible.set(false);
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notify.error(error);
  }
}
