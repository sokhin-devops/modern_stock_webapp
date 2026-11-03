import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';

import { AuthService } from '../../core/auth/auth.service';
import { NotifyService } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';
import { revealErrors, showError } from '../../shared/forms';

/** Accounts with a verified email get a reset link; staff without email ask their Owner (PLAIN.md 11.12). */
@Component({
  selector: 'ms-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FloatLabel, InputText, ButtonDirective, ButtonLabel, AuthFrame],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  protected readonly showError = showError;
  protected readonly busy = signal(false);
  protected readonly sent = signal<{ devLink?: string } | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
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
