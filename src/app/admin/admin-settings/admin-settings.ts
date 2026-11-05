import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { SelectButton } from 'primeng/selectbutton';
import { Textarea } from 'primeng/textarea';

import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';
import { FieldLabel } from '../../shared/field-label/field-label';
import { revealErrors } from '../../shared/forms';

interface PlatformSettings {
  trialDays: number;
  maxBusinessesPerAccount: number;
  invitationExpiryDays: number;
  announcementEn: string;
  announcementKm: string;
  announcementLevel: 'INFO' | 'WARN';
}

/**
 * Platform settings (FR-8.8, FR-8.10): trial length, businesses per account, invitation expiry, and the announcement
 * banner shown over the app to everyone (maintenance, news). New values apply from now on.
 */
@Component({
  selector: 'ms-admin-settings',
  imports: [ReactiveFormsModule, TranslatePipe, InputNumber, Textarea, SelectButton, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './admin-settings.html',
  styleUrl: '../admin-tab.scss',
})
export class AdminSettings {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  protected readonly levels = [
    { value: 'INFO', label: 'admin.settings.levelInfo' },
    { value: 'WARN', label: 'admin.settings.levelWarn' },
  ];
  protected readonly form = inject(NonNullableFormBuilder).group({
    trialDays: [30, [Validators.required, Validators.min(1), Validators.max(365)]],
    maxBusinessesPerAccount: [5, [Validators.required, Validators.min(1), Validators.max(100)]],
    invitationExpiryDays: [7, [Validators.required, Validators.min(1), Validators.max(60)]],
    announcementEn: ['', Validators.maxLength(255)],
    announcementKm: ['', Validators.maxLength(255)],
    announcementLevel: ['INFO' as 'INFO' | 'WARN'],
  });

  constructor() {
    this.api.get<PlatformSettings>('/admin/settings').subscribe({
      next: (s) => this.form.reset(s),
      error: (e) => this.notify.error(e),
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    this.busy.set(true);
    this.api.put<PlatformSettings>('/admin/settings', this.form.getRawValue()).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.form.reset(s);
        this.notify.showKey('settings.saved');
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected clearAnnouncement(): void {
    this.form.patchValue({ announcementEn: '', announcementKm: '' });
    this.form.markAsDirty();
  }
}
