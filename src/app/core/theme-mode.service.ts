import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ApplicationRef, Injectable, effect, inject, signal, untracked } from '@angular/core';

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
  private readonly appRef = inject(ApplicationRef);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  readonly mode = signal<UiMode>(read() ?? 'light');
  readonly dark = signal(this.document.documentElement.classList.contains('app-dark'));
  readonly density = signal<UiDensity>(readDensity() ?? 'comfortable');

  /** A light/dark change is on screen. */
  private changing = false;
  /** Where the next change starts: the button last clicked. */
  private from: { x: number; y: number } | null = null;
  /** That button's place on screen, to catch clicks on it while a change is showing. */
  private button: DOMRect | null = null;

  constructor() {
    this.media?.addEventListener('change', () => this.apply(true));
    // While a change is showing, the browser hands every click to the page itself, not to the button under it. A click
    // on the light/dark button's spot still counts, so quick clicks end on the mode the person last asked for.
    this.document.addEventListener(
      'click',
      (e) => {
        const b = this.button;
        if (this.changing && b && e.target === this.document.documentElement && e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom) {
          this.toggle();
        }
      },
      true,
    );
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

  /** The moon and sun buttons: the other of light and dark (of the last choice, if a change is still on screen). */
  toggle(event?: Event): void {
    this.set(this.wanted() ? 'light' : 'dark', true, event);
  }

  /** A choice made by the person (not one restored from the account) changes the screen with the animation. */
  set(mode: UiMode, saveToAccount = true, event?: Event): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
    this.apply(saveToAccount, event);
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

  /** Dark or not, as chosen (the screen may still be changing to it). */
  private wanted(): boolean {
    return this.mode() === 'dark' || (this.mode() === 'system' && !!this.media?.matches);
  }

  /**
   * Puts the chosen mode on the page. Light and dark change in one go: while .theme-switching is on, no element runs
   * its own color transition (buttons, chips and fields used to fade at different speeds, some late). With `animate`,
   * the browser's View Transitions show the new mode as a circle growing from the clicked button (from the middle
   * without one); without support for it, or with "reduce motion", the change is instant.
   *
   * Clicking again while a change is on screen never cuts it off: the change finishes, then, if the last choice is
   * not what shows, one more change runs. Clicking twice quickly ends where it started, without flashing.
   */
  private apply(animate = false, event?: Event): void {
    const root = this.document.documentElement;
    root.classList.toggle('compact', this.density() === 'compact');
    const view = this.document.defaultView;
    if (view && event) {
      this.from = origin(event, view);
      this.button = buttonOf(event);
    }
    if (this.changing) {
      return; // picked up when the change on screen ends
    }
    const dark = this.wanted();
    if (dark === root.classList.contains('app-dark')) {
      this.dark.set(dark);
      return;
    }
    const swap = () => {
      root.classList.toggle('app-dark', dark);
      this.dark.set(dark);
      try {
        this.appRef.tick(); // the sun/moon icons change in the same picture as the colors
      } catch {
        // already in a change detection pass: Angular updates them right after
      }
    };
    const doc = this.document as Document & { startViewTransition?: (update: () => void) => ViewTransition };
    const reduced = !!view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    root.classList.add('theme-switching');
    if (!animate || reduced || !doc.startViewTransition || !view) {
      swap();
      view?.requestAnimationFrame(() => view.requestAnimationFrame(() => root.classList.remove('theme-switching')));
      return;
    }
    const { x, y } = this.from ?? { x: view.innerWidth / 2, y: view.innerHeight / 2 };
    this.from = null;
    const radius = Math.hypot(Math.max(x, view.innerWidth - x), Math.max(y, view.innerHeight - y));
    this.changing = true;
    const transition = doc.startViewTransition(swap);
    transition.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 420, easing: 'cubic-bezier(0.2, 0, 0, 1)', pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => undefined);
    transition.finished.finally(() => {
      root.classList.remove('theme-switching');
      this.changing = false;
      this.apply(true);
    });
  }
}

/** The clicked button's place on screen, if the click came from one. */
function buttonOf(event: Event | undefined): DOMRect | null {
  const target = (event?.currentTarget ?? event?.target) as Element | null | undefined;
  const r = target?.getBoundingClientRect?.();
  return r && (r.width || r.height) ? r : null;
}

/** Where the new mode starts: the middle of the clicked button, else the middle of the screen. */
function origin(event: Event | undefined, view: Window): { x: number; y: number } {
  const r = buttonOf(event);
  if (r) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  if (event instanceof MouseEvent && (event.clientX || event.clientY)) {
    return { x: event.clientX, y: event.clientY };
  }
  return { x: view.innerWidth / 2, y: view.innerHeight / 2 };
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
