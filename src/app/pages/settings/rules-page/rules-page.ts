import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormsModule, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { BusinessSettings } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { ApiFilePipe } from '../../../shared/api-file.pipe';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { ImageField } from '../../../shared/image-field/image-field';
import { revealErrors } from '../../../shared/forms';

/** Document types by area, for their number prefixes (FR-7.11); the codes are the API's DocType. */
const NUMBER_GROUPS = [
  { key: 'sales', types: ['QO', 'SO', 'DO', 'INV', 'TAX', 'RCT', 'RCV', 'SR', 'CN', 'DN'] },
  { key: 'purchases', types: ['PO', 'GRN', 'BILL', 'PAY', 'PRT', 'SC', 'EXP'] },
  { key: 'stock', types: ['ADJ', 'TRF', 'CNT'] },
];
/** 1 to 6 letters or digits, starting with a letter (saved in capitals). */
const PREFIX = /^[A-Za-z][A-Za-z0-9]{0,5}$/;

/** Each kind of document keeps its own prefix. */
function distinct(group: AbstractControl): ValidationErrors | null {
  const values = Object.values(group.getRawValue() as Record<string, string>).map((v) => v.trim().toUpperCase());
  return new Set(values).size < values.length ? { twice: true } : null;
}

/** The near-expiry windows must grow: 30 < 60 < 90. */
function growing(group: AbstractControl): ValidationErrors | null {
  const { expiry1, expiry2, expiry3 } = group.getRawValue() as { expiry1: number; expiry2: number; expiry3: number };
  return expiry1 == null || expiry2 == null || expiry3 == null || (expiry1 < expiry2 && expiry2 < expiry3) ? null : { expiryOrder: true };
}

/**
 * "Tax and receipt" and "Sales rules" (prototype tax.html, sales-rules.html): two views of the business settings
 * (PLAIN.md 11.4, 11.6). The route path picks the view; saving sends all settings, so nothing is lost.
 */
@Component({
  selector: 'ms-rules-page',
  imports: [
    ReactiveFormsModule, FormsModule, TranslatePipe, InputNumber, InputText, SelectButton, ToggleSwitch, ButtonDirective, ButtonLabel, FieldLabel, ImageField,
    ApiFilePipe,
  ],
  templateUrl: './rules-page.html',
  styleUrl: './rules-page.scss',
})
export class RulesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);

  /** 'tax' (Tax and receipt) or 'rules' (Sales rules). */
  protected readonly view: 'tax' | 'rules' = inject(ActivatedRoute).snapshot.routeConfig?.path === 'settings/tax' ? 'tax' : 'rules';
  protected readonly busy = signal(false);
  protected readonly roundings = [
    { value: 100, label: '៛100' },
    { value: 500, label: '៛500' },
    { value: 1000, label: '៛1,000' },
  ];
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly numberGroups = NUMBER_GROUPS;
  /** This month, as it shows in a number: INV-202611-0001. */
  private readonly period = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  protected readonly form = this.fb.group({
    vatEnabled: [false],
    vatRate: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
    rielRounding: [100],
    maxDiscountPercent: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
    allowNegativeStock: [false],
    receiptFooter: ['', Validators.maxLength(255)],
    receiptHeader: ['', Validators.maxLength(255)],
    receiptPaper: [80 as 58 | 80],
    receiptShowVatTin: [true],
    khqrEnabled: [true],
    bankEnabled: [true],
    // Near expiry (FR-7.10): three windows in days, each longer than the one before
    expiry1: [30, [Validators.required, Validators.min(1), Validators.max(365)]],
    expiry2: [60, [Validators.required, Validators.min(1), Validators.max(365)]],
    expiry3: [90, [Validators.required, Validators.min(1), Validators.max(365)]],
    // Document number prefixes (FR-7.11), the type's code by default
    numberPrefixes: this.fb.record(
      Object.fromEntries(
        NUMBER_GROUPS.flatMap((g) => g.types).map((t) => [t, this.fb.control(t, [Validators.required, Validators.pattern(PREFIX)])]),
      ),
      { validators: distinct },
    ),
  }, { validators: growing });
  protected readonly papers = [
    { value: 80, label: '80 mm' },
    { value: 58, label: '58 mm' },
  ];
  /** The KHQR image is saved as soon as it is chosen or removed (not with the form). */
  protected readonly khqrUrl = signal<string | null>(null);
  protected readonly khqrBusy = signal(false);

  constructor() {
    this.api.get<BusinessSettings>('/business/settings').subscribe({
      next: (s) => {
        const [expiry1, expiry2, expiry3] = s.expiryDays;
        this.form.reset({ ...s, receiptFooter: s.receiptFooter ?? '', receiptHeader: s.receiptHeader ?? '', expiry1, expiry2, expiry3 });
        this.khqrUrl.set(s.khqrImageUrl);
        if (!this.business.can('business:manage')) {
          this.form.disable();
        }
      },
      error: (e) => this.notify.error(e),
    });
  }

  protected uploadKhqr(file: File): void {
    this.saveKhqr(this.api.upload<BusinessSettings>('/business/khqr', file));
  }

  protected removeKhqr(): void {
    this.saveKhqr(this.api.delete<BusinessSettings>('/business/khqr'));
  }

  private saveKhqr(call: Observable<BusinessSettings>): void {
    this.khqrBusy.set(true);
    call.subscribe({
      next: (s) => {
        this.khqrBusy.set(false);
        this.khqrUrl.set(s.khqrImageUrl);
      },
      error: (e) => {
        this.khqrBusy.set(false);
        this.notify.error(e);
      },
    });
  }

  /** How the next number of this type will look. */
  protected example(type: string): string {
    const prefix = this.form.controls.numberPrefixes.controls[type]?.value?.trim().toUpperCase();
    return `${prefix && PREFIX.test(prefix) ? prefix : type}-${this.period}-0001`;
  }

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const { expiry1, expiry2, expiry3, numberPrefixes, ...v } = this.form.getRawValue();
    this.busy.set(true);
    const body = {
      ...v,
      receiptFooter: v.receiptFooter.trim() || null,
      receiptHeader: v.receiptHeader.trim() || null,
      expiryDays: [expiry1, expiry2, expiry3],
      numberPrefixes: Object.fromEntries(Object.entries(numberPrefixes).map(([t, p]) => [t, p.trim().toUpperCase()])),
    };
    this.api.put<BusinessSettings>('/business/settings', body).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey('settings.saved');
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
