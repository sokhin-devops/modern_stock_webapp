import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatError, MatFormField, MatHint, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { switchMap } from 'rxjs';

import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';
import { CAMBODIAN_PHONE } from '../../shared/validators';

/**
 * Setup page (prototype setup.html, PLAIN.md 11.12): first branch, today's rate, riel rounding and VAT.
 * PUT /business/onboarding also adds the starter units, a General category and the "Market" supplier.
 */
@Component({
  selector: 'ms-setup',
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, MatFormField, MatLabel, MatHint, MatError, MatPrefix, MatInput,
    MatButton, MatIcon, MatButtonToggleGroup, MatButtonToggle, MatSlideToggle,
  ],
  templateUrl: './setup.html',
  styleUrl: './setup.scss',
})
export class Setup {
  protected readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
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
      this.form.markAllAsTouched();
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
