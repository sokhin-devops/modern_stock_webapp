import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/auth/auth.service';
import { NotifyService } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';

/** Accounts with a verified email get a reset link; staff without email ask their Owner (PLAIN.md 11.12). */
@Component({
  selector: 'ms-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, MatFormField, MatLabel, MatError, MatInput, MatButton, MatIcon, AuthFrame],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  protected readonly sent = signal<{ devLink?: string } | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.auth.forgotPassword(this.form.getRawValue().email.trim()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.sent.set({ devLink: r.devLink });
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected devPath(link: string): string {
    return link.replace(/^https?:\/\/[^/]+/, '');
  }
}
