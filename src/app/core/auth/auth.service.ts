import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Lang, MessageResponse, TokenResponse, UserResponse } from '../api/models';

const API = environment.apiUrl;

export interface SignUpRequest {
  fullName: string;
  email: string;
  password: string;
  phone?: string | null;
  locale: Lang;
  acceptTerms: boolean;
}

export interface SignUpWithInvitationRequest {
  token: string;
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
  phone?: string | null;
  email?: string | null;
}

/**
 * Login state (PLAIN.md 11.12). The access token (15 minutes) is kept in memory only; the refresh token is an
 * HttpOnly cookie the browser sends to /auth/*. After a browser refresh, init() trades the cookie for a new access
 * token before the first screen renders, so the user stays logged in without ever storing a token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private token: string | null = null;
  private refreshing: Observable<string | null> | null = null;

  readonly user = signal<UserResponse | null>(null);
  readonly loggedIn = computed(() => this.user() !== null);

  accessToken(): string | null {
    return this.token;
  }

  /** App start (provideAppInitializer): restore the session from the refresh cookie, if there is one. */
  init(): Promise<void> {
    return firstValueFrom(this.refresh()).then(() => undefined);
  }

  /** One refresh at a time: requests that fail with 401 together all wait for the same new token. */
  refresh(): Observable<string | null> {
    this.refreshing ??= this.http.post<TokenResponse>(`${API}/auth/refresh`, null, { withCredentials: true }).pipe(
      map((r) => this.setSession(r)),
      catchError(() => {
        this.clear();
        return of(null);
      }),
      finalize(() => (this.refreshing = null)),
      shareReplay(1),
    );
    return this.refreshing;
  }

  login(login: string, password: string): Observable<UserResponse> {
    return this.http
      .post<TokenResponse>(`${API}/auth/login`, { login, password }, { withCredentials: true })
      .pipe(map((r) => (this.setSession(r), r.user)));
  }

  signUp(request: SignUpRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${API}/auth/sign-up`, request);
  }

  resendVerification(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${API}/auth/resend-verification`, { email });
  }

  verifyEmail(token: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${API}/auth/verify-email`, { token });
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${API}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${API}/auth/reset-password`, { token, newPassword });
  }

  /** New account from an invitation link; the answer says which business to open. */
  signUpWithInvitation(request: SignUpWithInvitationRequest): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${API}/auth/sign-up-with-invitation`, request, { withCredentials: true })
      .pipe(tap((r) => this.setSession(r)));
  }

  /**
   * Another member takes over this device with their POS PIN (FR-6.19). The new refresh cookie replaces this one;
   * the page then starts again as that person.
   */
  pinSwitch(businessId: number, userId: number, pin: string): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${API}/auth/pin-switch`, { businessId, userId, pin }, { withCredentials: true })
      .pipe(tap((r) => this.setSession(r)));
  }

  /** After the account is deleted (FR-6.7): nothing to sign out of any more. */
  forget(): void {
    this.clear();
    this.router.navigate(['/login']);
  }

  logout(): void {
    this.http.post(`${API}/auth/logout`, null, { withCredentials: true }).subscribe({ error: () => undefined });
    this.clear();
    this.router.navigate(['/login']);
  }

  /** The refresh cookie has expired too: back to the login page, then back to where the user was. */
  sessionExpired(): void {
    this.clear();
    this.router.navigate(['/login'], { queryParams: { expired: 1, returnUrl: this.router.url } });
  }

  private setSession(r: TokenResponse): string {
    this.token = r.accessToken;
    this.user.set(r.user);
    return r.accessToken;
  }

  private clear(): void {
    this.token = null;
    this.user.set(null);
  }
}
