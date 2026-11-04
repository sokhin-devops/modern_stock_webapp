import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Drawer } from 'primeng/drawer';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../../core/api/api.service';
import { Customer, Supplier } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { fromIsoDate, toIsoDate } from '../../../shared/dates';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { revealErrors } from '../../../shared/forms';
import { CAMBODIAN_PHONE } from '../../../shared/validators';

export type PartnerKind = 'customer' | 'supplier';
export type Partner = Customer | Supplier;

/**
 * Add or edit a customer or a supplier (prototype customers.html / suppliers.html drawer): contact details, payment
 * terms, credit limit (customers), and the balance owed before the business started with ModernStock.
 */
@Component({
  selector: 'ms-partner-form',
  imports: [
    ReactiveFormsModule, TranslatePipe, Drawer, InputText, InputNumber, DatePicker, SelectButton, ButtonDirective,
    ButtonLabel, FieldLabel,
  ],
  templateUrl: './partner-form.html',
  styleUrl: './partner-form.scss',
})
export class PartnerForm {
  readonly kind = input.required<PartnerKind>();
  readonly partner = input<Partner | null>(null);
  readonly visible = model(false);
  readonly saved = output<Partner>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly busy = signal(false);
  protected readonly isCustomer = computed(() => this.kind() === 'customer');
  protected readonly canManage = computed(() => this.business.can(this.isCustomer() ? 'customer:manage' : 'supplier:manage'));
  protected readonly types = [
    { value: 'INDIVIDUAL', label: 'partners.INDIVIDUAL' },
    { value: 'COMPANY', label: 'partners.COMPANY' },
  ];

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    type: ['INDIVIDUAL'],
    contactPerson: ['', Validators.maxLength(120)],
    phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
    telegram: ['', Validators.maxLength(60)],
    address: ['', Validators.maxLength(255)],
    vatTin: ['', Validators.maxLength(30)],
    creditLimit: this.fb.control<number | null>(null, Validators.min(0)),
    paymentTermsDays: this.fb.control<number | null>(null, Validators.min(0)),
    openingBalance: this.fb.control<number | null>(null),
    openingBalanceDate: this.fb.control<Date | null>(null),
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        const p = this.partner() as (Customer & Supplier) | null;
        this.form.reset({
          name: p?.name ?? '',
          type: p?.type ?? 'INDIVIDUAL',
          contactPerson: p?.contactPerson ?? '',
          phone: p?.phone ?? '',
          telegram: p?.telegram ?? '',
          address: p?.address ?? '',
          vatTin: p?.vatTin ?? '',
          creditLimit: p?.creditLimit ?? null,
          paymentTermsDays: p?.paymentTermsDays ?? null,
          openingBalance: p?.openingBalance ?? null,
          openingBalanceDate: fromIsoDate(p?.openingBalanceDate),
        });
        if (this.canManage() || !p) {
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
    const common = {
      name: v.name.trim(),
      phone: v.phone.trim() || null,
      address: v.address.trim() || null,
      vatTin: v.vatTin.trim() || null,
      paymentTermsDays: v.paymentTermsDays,
      openingBalance: v.openingBalance,
      openingBalanceDate: toIsoDate(v.openingBalanceDate),
    };
    const body = this.isCustomer()
      ? { ...common, type: v.type, creditLimit: v.creditLimit }
      : { ...common, contactPerson: v.contactPerson.trim() || null, telegram: v.telegram.trim() || null };
    const path = this.isCustomer() ? '/customers' : '/suppliers';
    const id = this.partner()?.id;
    this.busy.set(true);
    (id == null ? this.api.post<Partner>(path, body) : this.api.put<Partner>(`${path}/${id}`, body)).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.notify.showKey('common.saved');
        this.saved.emit(saved);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected deactivate(): void {
    const p = this.partner();
    if (!p) {
      return;
    }
    this.confirm.confirm({
      header: this.translate.instant('partners.deactivate'),
      message: this.translate.instant('partners.deactivateConfirm', { name: p.name }),
      acceptLabel: this.translate.instant('partners.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () =>
        this.api.delete(`${this.isCustomer() ? '/customers' : '/suppliers'}/${p.id}`).subscribe({
          next: () => {
            this.notify.showKey('partners.deactivated');
            this.saved.emit({ ...p, active: false });
            this.visible.set(false);
          },
          error: (e) => this.notify.error(e),
        }),
    });
  }
}
