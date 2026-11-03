import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { FloatLabel } from 'primeng/floatlabel';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { switchMap } from 'rxjs';

import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';
import { revealErrors, showError } from '../../shared/forms';
import { CAMBODIAN_PHONE } from '../../shared/validators';

/**
 * Setup page (prototype setup.html, PLAIN.md 11.12): first branch, today's rate, riel rounding and VAT.
 * PUT /business/onboarding also adds the starter units, a General category and the "Market" supplier.
 */
@Component({
  selector: 'ms-setup',
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, FloatLabel, InputText, InputNumber, SelectButton, ToggleSwitch,
    ButtonDirective, ButtonIcon, ButtonLabel,
  ],
  templateUrl: './setup.html',
  styleUrl: './setup.scss',
})
export class Setup {
  protected readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly showError = showError;
  protected readonly busy = signal(false);
  /** Riel rounding steps (PLAIN.md 11.6). */
  protected readonly roundings = [
    { label: '100', value: 100 },
    { label: '500', value: 500 },
    { label: '1,000', value: 1000 },
  ];
  protected readonly name = computed(() => {
    const b = this.business.current();
    return b ? this.lang.name(b.nameEn, b.nameKm) : '';
  });
  protected readonly form = inject(NonNullableFormBuilder).group({
    branchName: ['', [Validators.required, Validators.maxLength(120)]],
    phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
    address: ['', Validators.maxLength(255)],
    rate: [4100, [Validators.required, Validators.min(1000), Validators.max(10000)]],
    rounding: [100],
    vat: [false],
  });

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.business
      .onboard({
        mainBranch: { nameEn: v.branchName.trim(), phone: v.phone || null, address: v.address || null },
        usdToKhr: v.rate,
        vatEnabled: v.vat,
        rielRounding: v.rounding,
      })
      .pipe(switchMap(() => this.business.loadContext()))
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }
}
