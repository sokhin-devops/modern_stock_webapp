import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';

import { AuthService } from '../../core/auth/auth.service';
import { NotifyService } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';

/** Opened from the verification email: /verify-email?token=… */
@Component({
  selector: 'ms-verify-email',
  imports: [RouterLink, TranslatePipe, ButtonDirective, ButtonLabel, ProgressSpinner, AuthFrame],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmail implements OnInit {
  readonly token = input<string>();

  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<'checking' | 'done' | 'error'>('checking');
  protected readonly error = signal<string | null>(null);

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
}
