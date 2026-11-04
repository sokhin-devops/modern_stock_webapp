import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
import { FieldLabel } from '../../../shared/field-label/field-label';
import { revealErrors } from '../../../shared/forms';

/**
 * "Tax and receipt" and "Sales rules" (prototype tax.html, sales-rules.html): two views of the business settings
 * (PLAIN.md 11.4, 11.6). The route path picks the view; saving sends all settings, so nothing is lost.
 */
@Component({
  selector: 'ms-rules-page',
  imports: [ReactiveFormsModule, TranslatePipe, InputNumber, InputText, SelectButton, ToggleSwitch, ButtonDirective, ButtonLabel, FieldLabel],
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
  protected readonly form = inject(NonNullableFormBuilder).group({
    vatEnabled: [false],
    vatRate: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
    rielRounding: [100],
    maxDiscountPercent: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
    allowNegativeStock: [false],
    receiptFooter: ['', Validators.maxLength(255)],
  });

  constructor() {
    this.api.get<BusinessSettings>('/business/settings').subscribe({
      next: (s) => {
        this.form.reset({ ...s, receiptFooter: s.receiptFooter ?? '' });
        if (!this.business.can('business:manage')) {
          this.form.disable();
        }
      },
      error: (e) => this.notify.error(e),
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.api.put<BusinessSettings>('/business/settings', { ...v, receiptFooter: v.receiptFooter.trim() || null }).subscribe({
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
