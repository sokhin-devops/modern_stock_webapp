import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { environment } from '../../environments/environment';
import { AuthService } from './auth/auth.service';

const KEY = 'ms-theme';

export type UiMode = 'light' | 'dark' | 'system';

/**
 * Light, dark, or like the device (FR-6.25): remembered in this browser and, when signed in, in the account, so it
 * follows the person to another device. index.html applies the saved choice before Angular starts, so a dark screen
 * never flashes white. The prototype styles, Tailwind and PrimeNG all follow .app-dark.
 */
@Injectable({ providedIn: 'root' })
export class ThemeModeService {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  readonly mode = signal<UiMode>(read() ?? 'light');
  readonly dark = signal(this.document.documentElement.classList.contains('app-dark'));

  constructor() {
    this.media?.addEventListener('change', () => this.apply());
    this.apply();
    // After signing in, the account's choice wins over this browser's.
    effect(() => {
      const saved = this.auth.user()?.uiMode;
      if (saved && saved !== untracked(this.mode)) {
        untracked(() => this.set(saved, false));
      }
    });
  }

  /** The moon and sun buttons: the other of light and dark. */
  toggle(): void {
    this.set(this.dark() ? 'light' : 'dark');
  }

  set(mode: UiMode, saveToAccount = true): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
    this.apply();
    if (saveToAccount && this.auth.loggedIn()) {
      this.http.put(`${environment.apiUrl}/me/preferences`, { uiMode: mode }).subscribe({ error: () => undefined });
    }
  }

  private apply(): void {
    const dark = this.mode() === 'dark' || (this.mode() === 'system' && !!this.media?.matches);
    this.dark.set(dark);
    this.document.documentElement.classList.toggle('app-dark', dark);
  }
}

function read(): UiMode | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}
