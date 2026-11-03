import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { BusinessService } from '../../core/business/business.service';
import { NotifyService } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';

/**
 * Sign in with email or username (PLAIN.md 11.12). Afterwards: back to the page asked for, or the only/last business,
 * or "My businesses" to choose or create one.
 */
@Component({
  selector: 'ms-login',
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, MatFormField, MatLabel, MatInput, MatSuffix, MatButton,
    MatIconButton, MatIcon, AuthFrame,
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
  protected readonly form = inject(NonNullableFormBuilder).group({
    login: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { login, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
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
      },
    });
  }
}
