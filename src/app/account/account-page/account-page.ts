import { Component, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../core/api/api.service';
import { Lang, UserResponse } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';
import { ThemeModeService, UiMode } from '../../core/theme-mode.service';
import { FieldLabel } from '../../shared/field-label/field-label';
import { revealErrors } from '../../shared/forms';
import { CAMBODIAN_PHONE, sameAs } from '../../shared/validators';

/**
 * My account (FR-6.3): my name, username and phone; language and light/dark mode (saved to the account); the password;
 * my POS PIN (FR-6.19); signing out on every device (FR-6.6); and deleting the account (FR-6.7). The same for every
 * business I belong to.
 */
@Component({
  selector: 'ms-account-page',
  imports: [FormsModule, ReactiveFormsModule, TranslatePipe, InputText, SelectButton, ButtonDirective, ButtonIcon, ButtonLabel, FieldLabel],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
})
export class AccountPage {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  protected readonly lang = inject(LangService);
  protected readonly theme = inject(ThemeModeService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly busy = signal<'profile' | 'password' | 'everywhere' | 'pin' | 'delete' | null>(null);
  protected readonly languages = [
    { value: 'km', label: 'ខ្មែរ' },
    { value: 'en', label: 'English' },
  ];
  protected readonly modes = [
    { value: 'light', label: 'settings.appearance.light', icon: 'pi pi-sun' },
    { value: 'dark', label: 'settings.appearance.dark', icon: 'pi pi-moon' },
    { value: 'system', label: 'settings.appearance.system', icon: 'pi pi-desktop' },
  ];

  protected readonly profile = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    username: ['', [Validators.minLength(3), Validators.maxLength(60), Validators.pattern(/^[A-Za-z0-9._-]+$/)]],
    phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
  });

  protected readonly password = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: sameAs('newPassword', 'confirmPassword') },
  );

  /** POS PIN (FR-6.19): 4 to 6 digits, twice, with the password. */
  protected readonly pin = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      pin: ['', [Validators.required, Validators.pattern(/^\d{4,6}$/)]],
      confirmPin: ['', Validators.required],
    },
    { validators: sameAs('pin', 'confirmPin') },
  );

  /** Delete my account (FR-6.7): the password, to be sure. */
  protected readonly deletePassword = signal('');

  constructor() {
    const u = this.auth.user();
    if (u) {
      this.profile.reset({ fullName: u.fullName, username: u.username ?? '', phone: u.phone ?? '' });
    }
  }

  protected saveProfile(): void {
    if (this.profile.invalid) {
      revealErrors(this.profile);
      return;
    }
    const v = this.profile.getRawValue();
    this.busy.set('profile');
    this.api.put<UserResponse>('/me', {
      fullName: v.fullName.trim(),
      username: v.username.trim() || null,
      phone: v.phone.trim() || null,
    }).subscribe({
      next: (u) => {
        this.busy.set(null);
        this.auth.user.set(u);
        this.profile.markAsPristine();
        this.notify.showKey('settings.saved');
      },
      error: (e) => this.fail(e),
    });
  }

  protected setLanguage(lang: Lang): void {
    this.lang.set(lang);
    this.api.put<UserResponse>('/me/preferences', { locale: lang }).subscribe({ next: (u) => this.auth.user.set(u) });
  }

  protected setMode(mode: UiMode): void {
    this.theme.set(mode);
  }

  protected changePassword(): void {
    if (this.password.invalid) {
      revealErrors(this.password);
      return;
    }
    const v = this.password.getRawValue();
    this.busy.set('password');
    this.api.put('/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword }).subscribe({
      next: () => {
        this.busy.set(null);
        this.password.reset();
        this.notify.showKey('accountPage.passwordChanged');
      },
      error: (e) => this.fail(e),
    });
  }

  protected savePin(): void {
    if (this.pin.invalid) {
      revealErrors(this.pin);
      return;
    }
    const v = this.pin.getRawValue();
    this.busy.set('pin');
    this.api.put<UserResponse>('/me/pin', { currentPassword: v.currentPassword, pin: v.pin }).subscribe({
      next: (u) => {
        this.busy.set(null);
        this.pin.reset();
        this.auth.user.set(u);
        this.notify.showKey('accountPage.pinSaved');
      },
      error: (e) => this.fail(e),
    });
  }

  protected removePin(): void {
    this.busy.set('pin');
    this.api.delete<UserResponse>('/me/pin').subscribe({
      next: (u) => {
        this.busy.set(null);
        this.auth.user.set(u);
        this.notify.showKey('accountPage.pinRemoved');
      },
      error: (e) => this.fail(e),
    });
  }

  /** Gone for good: name, email and phone removed, every device signed out (the API refuses for a last Owner). */
  protected deleteAccount(): void {
    const password = this.deletePassword();
    if (!password) {
      return;
    }
    this.confirm.confirm({
      header: this.translate.instant('accountPage.deleteTitle'),
      message: this.translate.instant('accountPage.deleteAsk'),
      acceptLabel: this.translate.instant('accountPage.deleteButton'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => {
        this.busy.set('delete');
        this.api.post('/me/delete', { password }).subscribe({
          next: () => {
            this.notify.showKey('accountPage.deleted');
            this.auth.forget();
          },
          error: (e) => this.fail(e),
        });
      },
    });
  }

  /** Every device signs out, this one too (FR-6.6). */
  protected signOutEverywhere(): void {
    this.confirm.confirm({
      header: this.translate.instant('accountPage.everywhere'),
      message: this.translate.instant('accountPage.everywhereAsk'),
      acceptLabel: this.translate.instant('accountPage.everywhereButton'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => {
        this.busy.set('everywhere');
        this.api.post('/auth/logout-all').subscribe({
          next: () => this.auth.logout(),
          error: (e) => this.fail(e),
        });
      },
    });
  }

  private fail(e: unknown): void {
    this.busy.set(null);
    this.notify.error(e);
  }
}
