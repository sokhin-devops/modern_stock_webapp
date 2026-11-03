import { DOCUMENT, Injectable, afterNextRender, inject } from '@angular/core';

/** Long enough to read as a deliberate splash, never a flicker. */
const MIN_VISIBLE_MS = 450;
/** Slow networks: stop waiting for the fonts and show the app anyway. */
const MAX_FONT_WAIT_MS = 1500;

/**
 * Hides the splash screen in index.html once the app has started (the session is restored before the first
 * render, see app.config.ts) and the fonts are ready, so the app appears in one smooth step.
 */
@Injectable({ providedIn: 'root' })
export class SplashService {
  private readonly document = inject(DOCUMENT);

  /** Call once from the root component's constructor. */
  hideWhenReady(): void {
    afterNextRender(() => {
      const splash = this.document.getElementById('ms-splash');
      if (!splash) {
        return;
      }
      const fonts = this.document.fonts?.ready ?? Promise.resolve();
      const fontsOrTimeout = Promise.race([fonts, wait(MAX_FONT_WAIT_MS)]);
      const minimum = wait(Math.max(0, MIN_VISIBLE_MS - performance.now()));
      Promise.all([fontsOrTimeout, minimum]).then(() => {
        splash.classList.add('ms-splash-out');
        // Remove it after the fade; the timeout covers browsers that skip transitionend.
        splash.addEventListener('transitionend', () => splash.remove(), { once: true });
        setTimeout(() => splash.remove(), 800);
      });
    });
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
