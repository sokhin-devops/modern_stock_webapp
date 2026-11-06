import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { ProgressSpinner } from 'primeng/progressspinner';

import { AuthService } from '../../core/auth/auth.service';
import { NotifyService } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';
import { FieldLabel } from '../../shared/field-label/field-label';

/** Opened from the verification email: /verify-email?token=… An old or used link can ask for a new one here. */
@Component({
  selector: 'ms-verify-email',
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, ButtonDirective, ButtonLabel, InputText, ProgressSpinner, AuthFrame,
    FieldLabel,
  ],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmail implements OnInit {
  readonly token = input<string>();

  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<'checking' | 'done' | 'error'>('checking');
  protected readonly error = signal<string | null>(null);
  protected readonly email = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });
  protected readonly resending = signal(false);
  protected readonly resent = signal<string | null>(null);

  ngOnInit(): void {
    const token = this.token();
    if (!token) {
      this.state.set('error');
      return;
    }
    this.auth.verifyEmail(token).subscribe({
      next: () => this.state.set('done'),
      error: (e) => {
        this.error.set(this.notify.message(e));
        this.state.set('error');
      },
    });
  }

  protected resend(): void {
    if (this.email.invalid) {
      this.email.markAsTouched();
      return;
    }
    this.resending.set(true);
    this.auth.resendVerification(this.email.value.trim()).subscribe({
      next: (r) => {
        this.resending.set(false);
        this.resent.set(r.message);
      },
      error: (e) => {
        this.resending.set(false);
        this.notify.error(e);
      },
    });
  }
}
