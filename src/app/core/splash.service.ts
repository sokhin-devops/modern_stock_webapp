import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take } from 'rxjs';

/** Long enough to read as a deliberate splash, never a flicker. */
const MIN_VISIBLE_MS = 450;
/** Slow networks: stop waiting for the fonts and show the app anyway. */
const MAX_FONT_WAIT_MS = 1500;

/**
 * The fonts the first screen needs. Loading them on purpose matters: the browser only fetches a web font once some
 * text uses it, and the first page is lazy-loaded, so "document.fonts.ready" alone would resolve before the icons
 * were even requested and they would pop in after the splash.
 */
const FONTS = ['16px primeicons', '400 16px Roboto', '500 16px Roboto', '400 16px "Kantumruy Pro"'];

/**
 * Hides the splash screen in index.html once the first page has been routed and rendered (the session is restored
 * before that, see app.config.ts) and its fonts are loaded, so the app appears in one smooth step.
 */
@Injectable({ providedIn: 'root' })
export class SplashService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  /** Call once from the root component's constructor. */
  hideWhenReady(): void {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
        take(1),
      )
      .subscribe(() => requestAnimationFrame(() => this.hide()));
  }

  private hide(): void {
    const splash = this.document.getElementById('ms-splash');
    if (!splash) {
      return;
    }
    const fonts = this.document.fonts;
    const loading = fonts
      ? Promise.all(FONTS.map((f) => fonts.load(f, sample(f)))).then(() => fonts.ready)
      : Promise.resolve();
    const fontsOrTimeout = Promise.race([loading.catch(() => undefined), wait(MAX_FONT_WAIT_MS)]);
    const minimum = wait(Math.max(0, MIN_VISIBLE_MS - performance.now()));
    Promise.all([fontsOrTimeout, minimum]).then(() => {
      splash.classList.add('ms-splash-out');
      // Remove it after the fade; the timeout covers browsers that skip transitionend.
      splash.addEventListener('transitionend', () => splash.remove(), { once: true });
      setTimeout(() => splash.remove(), 800);
    });
  }
}

/** Text the font draws, so the browser fetches it: a Khmer letter, a PrimeIcons glyph (pi-box), or a Latin letter. */
function sample(font: string): string {
  return font.includes('Kantumruy') ? 'ក' : font.includes('primeicons') ? '\ue9d9' : 'a';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
