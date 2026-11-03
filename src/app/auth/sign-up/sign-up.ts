import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';
import { revealErrors, showError } from '../../shared/forms';
import { CAMBODIAN_PHONE } from '../../shared/validators';

/** Create an account (PLAIN.md 11.12). The account is unverified until the email link is opened. */
@Component({
  selector: 'ms-sign-up',
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, FloatLabel, InputText, Checkbox, ButtonDirective, ButtonIcon,
    ButtonLabel, AuthFrame,
  ],
  templateUrl: './sign-up.html',
  styleUrl: './sign-up.scss',
})
export class SignUp {
  private readonly auth = inject(AuthService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly websiteUrl = environment.websiteUrl;
  protected readonly showError = showError;
  protected readonly showPassword = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** After sign-up: the email the link went to, and the link itself in development. */
  protected readonly sent = signal<{ email: string; devLink?: string } | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    acceptTerms: [false, Validators.requiredTrue],
  });

  protected lang$ = this.lang.lang;

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.auth
      .signUp({ ...value, email: value.email.trim(), phone: value.phone || null, locale: this.lang.lang() })
      .subscribe({
        next: (r) => {
          this.busy.set(false);
          this.sent.set({ email: value.email.trim(), devLink: r.devLink });
        },
        error: (e) => {
          this.busy.set(false);
          this.error.set(this.notify.message(e));
        },
      });
  }

  protected resend(): void {
    const sent = this.sent();
    if (!sent) {
      return;
    }
    this.auth.resendVerification(sent.email).subscribe({
      next: (r) => {
        this.sent.set({ ...sent, devLink: r.devLink ?? sent.devLink });
        this.notify.showKey('auth.resent');
      },
      error: (e) => this.notify.error(e),
    });
  }

  /** The dev link points at the web app's /verify-email page; keep the user on this host. */
  protected devPath(link: string): string {
    return link.replace(/^https?:\/\/[^/]+/, '');
  }
}
