import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { ProgressSpinner } from 'primeng/progressspinner';
import { switchMap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { InvitationDetails } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';
import { AuthFrame } from '../../shared/auth-frame/auth-frame';
import { revealErrors, showError } from '../../shared/forms';
import { CAMBODIAN_PHONE, sameAs } from '../../shared/validators';

/**
 * The invitation link (PLAIN.md 11.12): shows the business, role and branch. New people create a login here
 * (no email needed); people with an account sign in and accept. Either way the business opens directly.
 */
@Component({
  selector: 'ms-invite',
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, FloatLabel, InputText, ButtonDirective, ButtonLabel, ProgressSpinner,
    AuthFrame,
  ],
  templateUrl: './invite.html',
  styleUrl: './invite.scss',
})
export class Invite implements OnInit {
  readonly token = input.required<string>();

  protected readonly auth = inject(AuthService);
  protected readonly lang = inject(LangService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotifyService);

  protected readonly details = signal<InvitationDetails | null>(null);
  protected readonly closed = signal(false);
  protected readonly showError = showError;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      fullName: ['', [Validators.required, Validators.maxLength(120)]],
      username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(60), Validators.pattern(/^[A-Za-z0-9._-]+$/)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirmPassword: ['', Validators.required],
      phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
      email: ['', Validators.email],
    },
    { validators: sameAs('password', 'confirmPassword') },
  );

  ngOnInit(): void {
    this.http.get<InvitationDetails>(`${environment.apiUrl}/public/invitations/${this.token()}`).subscribe({
      next: (d) => {
        this.details.set(d);
        this.closed.set(d.status !== 'PENDING');
      },
      error: () => this.closed.set(true),
    });
  }

  protected join(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.auth
      .signUpWithInvitation({
        token: this.token(),
        ...value,
        username: value.username.trim(),
        phone: value.phone || null,
        email: value.email || null,
      })
      .pipe(switchMap((r) => this.business.loadMine().pipe(switchMap(() => [r.businessId]))))
      .subscribe({
        next: (businessId) => this.openBusiness(businessId ?? null),
        error: (e) => {
          this.busy.set(false);
          this.error.set(this.notify.message(e));
        },
      });
  }

  /** Signed in already: accept with the token from the link. */
  protected accept(): void {
    this.busy.set(true);
    this.business
      .acceptInvitation(this.token())
      .pipe(switchMap((b) => this.business.loadMine().pipe(switchMap(() => [b.id]))))
      .subscribe({
        next: (id) => this.openBusiness(id),
        error: (e) => {
          this.busy.set(false);
          this.error.set(this.notify.message(e));
        },
      });
  }

  protected decline(): void {
    this.business.declineInvitation(this.token()).subscribe({
      next: () => this.router.navigate(['/businesses']),
      error: (e) => this.notify.error(e),
    });
  }

  private openBusiness(id: number | null): void {
    if (id != null) {
      this.business.open(id);
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/businesses']);
    }
  }
}
