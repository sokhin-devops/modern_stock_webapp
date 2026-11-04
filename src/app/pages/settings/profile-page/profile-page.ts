import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../../core/api/api.service';
import { BusinessProfile } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { revealErrors } from '../../../shared/forms';
import { CAMBODIAN_PHONE } from '../../../shared/validators';

const TYPES = ['MINI_MART', 'GROCERY', 'PHARMACY', 'COSMETICS', 'HARDWARE', 'PHONE_SHOP', 'WHOLESALE', 'OTHER'];

/** Business profile (prototype settings.html): names, type, contacts, VAT TIN and the language of documents. */
@Component({
  selector: 'ms-profile-page',
  imports: [ReactiveFormsModule, TranslatePipe, InputText, Select, SelectButton, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly translate = inject(TranslateService);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  protected readonly types = computed(() => {
    this.lang.lang();
    return TYPES.map((value) => ({ value, label: this.translate.instant(`account.types.${value}`) }));
  });
  protected readonly languages = [
    { value: 'km', label: 'ខ្មែរ' },
    { value: 'en', label: 'English' },
  ];
  protected readonly form = inject(NonNullableFormBuilder).group({
    nameEn: ['', [Validators.required, Validators.maxLength(120)]],
    nameKm: ['', Validators.maxLength(120)],
    businessType: ['MINI_MART', Validators.required],
    phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
    email: ['', [Validators.email, Validators.maxLength(160)]],
    address: ['', Validators.maxLength(255)],
    province: ['', Validators.maxLength(60)],
    vatTin: ['', Validators.maxLength(30)],
    language: ['km'],
  });
  private themeColor: string | null = null;

  constructor() {
    this.api.get<BusinessProfile>('/business').subscribe({
      next: (b) => {
        this.themeColor = b.themeColor;
        this.form.reset({
          nameEn: b.nameEn,
          nameKm: b.nameKm ?? '',
          businessType: b.businessType,
          phone: b.phone ?? '',
          email: b.email ?? '',
          address: b.address ?? '',
          province: b.province ?? '',
          vatTin: b.vatTin ?? '',
          language: b.language ?? 'km',
        });
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
    const body = {
      nameEn: v.nameEn.trim(),
      nameKm: v.nameKm.trim() || null,
      businessType: v.businessType,
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      address: v.address.trim() || null,
      province: v.province.trim() || null,
      vatTin: v.vatTin.trim() || null,
      themeColor: this.themeColor,
      language: v.language,
    };
    this.busy.set(true);
    this.api.put<BusinessProfile>('/business', body).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.business.setProfile(saved);
        // The name shows in the top bar's business switcher.
        this.business.loadMine().subscribe();
        this.notify.showKey('settings.saved');
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
