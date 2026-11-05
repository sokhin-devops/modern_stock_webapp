import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { environment } from '../../environments/environment';
import { AuthService } from './auth/auth.service';

const KEY = 'ms-theme';
const DENSITY_KEY = 'ms-density';

export type UiMode = 'light' | 'dark' | 'system';
export type UiDensity = 'comfortable' | 'compact';

/**
 * Light, dark, or like the device (FR-6.25), and comfortable or compact rows (FR-6.26): remembered in this browser and,
 * when signed in, in the account, so they follow the person to another device. index.html applies the saved mode
 * before Angular starts, so a dark screen never flashes white. The prototype styles, Tailwind and PrimeNG all follow
 * .app-dark; tables and the side menu follow .compact.
 */
@Injectable({ providedIn: 'root' })
export class ThemeModeService {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  readonly mode = signal<UiMode>(read() ?? 'light');
  readonly dark = signal(this.document.documentElement.classList.contains('app-dark'));
  readonly density = signal<UiDensity>(readDensity() ?? 'comfortable');

  constructor() {
    this.media?.addEventListener('change', () => this.apply());
    this.apply();
    // After signing in, the account's choice wins over this browser's.
    effect(() => {
      const saved = this.auth.user()?.uiMode;
      if (saved && saved !== untracked(this.mode)) {
        untracked(() => this.set(saved, false));
      }
      const density = this.auth.user()?.uiDensity;
      if (density && density !== untracked(this.density)) {
        untracked(() => this.setDensity(density, false));
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

  setDensity(density: UiDensity, saveToAccount = true): void {
    this.density.set(density);
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
    this.apply();
    if (saveToAccount && this.auth.loggedIn()) {
      this.http.put(`${environment.apiUrl}/me/preferences`, { uiDensity: density }).subscribe({ error: () => undefined });
    }
  }

  private apply(): void {
    this.document.documentElement.classList.toggle('compact', this.density() === 'compact');
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

function readDensity(): UiDensity | null {
  try {
    const value = localStorage.getItem(DENSITY_KEY);
    return value === 'comfortable' || value === 'compact' ? value : null;
  } catch {
    return null;
  }
}
