import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

const KEY = 'ms-theme';

/**
 * Light or dark, remembered per browser. index.html applies the saved choice before Angular starts,
 * so a dark screen never flashes white. The prototype styles, Tailwind and Angular Material all follow .app-dark.
 */
@Injectable({ providedIn: 'root' })
export class ThemeModeService {
  private readonly document = inject(DOCUMENT);

  readonly dark = signal(this.document.documentElement.classList.contains('app-dark'));

  toggle(): void {
    const dark = !this.dark();
    this.dark.set(dark);
    this.document.documentElement.classList.toggle('app-dark', dark);
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light');
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }
}
