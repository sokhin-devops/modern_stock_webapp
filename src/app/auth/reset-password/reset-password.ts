import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/auth/auth.service';
import { NotifyService } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';
import { sameAs } from '../../shared/validators';

/** Opened from a reset link (email, or one the Owner made for staff without email): /reset-password?token=… */
@Component({
  selector: 'ms-reset-password',
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, MatFormField, MatLabel, MatHint, MatError, MatInput, MatButton,
    MatIcon, AuthFrame,
  ],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  readonly token = input<string>();

  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirm: ['', Validators.required],
    },
    { validators: sameAs('password', 'confirm') },
  );

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth.resetPassword(this.token() ?? '', this.form.getRawValue().password).subscribe({
      next: () => this.done.set(true),
      error: (e) => {
        this.busy.set(false);
        this.error.set(this.notify.message(e));
      },
    });
  }
}
