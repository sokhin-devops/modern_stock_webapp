import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { BusinessService } from '../../core/business/business.service';
import { NotifyService, errorCode } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';
import { FieldLabel } from '../../shared/field-label/field-label';
import { revealErrors } from '../../shared/forms';

/**
 * Sign in with email or username (PLAIN.md 11.12). Afterwards: back to the page asked for, or the only/last business,
 * or "My businesses" to choose or create one.
 */
@Component({
  selector: 'ms-login',
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, InputText, ButtonDirective, ButtonIcon, ButtonLabel,
    AuthFrame, FieldLabel,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  /** Query parameters (withComponentInputBinding). */
  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  private readonly auth = inject(AuthService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly showPassword = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The account exists but its email isn't verified: offer a new link (only when they signed in with the email). */
  protected readonly unverified = signal<string | null>(null);
  protected readonly resending = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    login: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const { login, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.unverified.set(null);
    this.auth.login(login.trim(), password).pipe(switchMap(() => this.business.loadMine())).subscribe({
      next: () => {
        const returnUrl = this.returnUrl();
        if (returnUrl && returnUrl !== '/' && !returnUrl.startsWith('/login')) {
          this.router.navigateByUrl(returnUrl);
          return;
        }
        const id = this.business.pickAfterLogin();
        if (id != null) {
          this.business.open(id);
          this.router.navigate(['/dashboard']);
        } else {
          this.router.navigate(['/businesses']);
        }
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.notify.message(e));
        const email = login.trim();
        this.unverified.set(errorCode(e) === 'EMAIL_NOT_VERIFIED' && email.includes('@') ? email : null);
      },
    });
  }

  protected resendVerification(): void {
    const email = this.unverified();
    if (!email) {
      return;
    }
    this.resending.set(true);
    this.auth.resendVerification(email).subscribe({
      next: () => {
        this.resending.set(false);
        this.notify.showKey('auth.resent');
      },
      error: (e) => {
        this.resending.set(false);
        this.notify.error(e);
      },
    });
  }
}
