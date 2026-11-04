import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideTranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { apiInterceptor } from './core/auth/api.interceptor';
import { AuthService } from './core/auth/auth.service';
import { JsonTranslateLoader } from './core/i18n';
import { LangService } from './core/lang.service';
import { ModernStockPreset } from './core/theme/modern-stock-preset';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideTranslateService({
      loader: provideTranslateLoader(JsonTranslateLoader),
      lang: 'km',
      fallbackLang: 'en',
    }),
    // PrimeNG 19 (MIT, no license key) with the Material preset in the prototype's colors. Its styles go into the
    // "primeng" CSS layer, before the prototype's components layer (tailwind.css), and dark mode follows .app-dark.
    provideAnimationsAsync(),
    providePrimeNG({
      ripple: true,
      theme: {
        preset: ModernStockPreset,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: { name: 'primeng', order: 'theme, base, primeng, components, utilities' },
        },
      },
    }),
    // The toasts and the "Are you sure?" dialog (<p-toast> and <p-confirmdialog> in app.html).
    MessageService,
    ConfirmationService,
    // Before the first screen: language, then the session from the refresh cookie (behind the splash).
    provideAppInitializer(() => {
      inject(LangService).init();
      return inject(AuthService).init();
    }),
  ],
};
