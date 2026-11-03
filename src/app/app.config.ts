import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideTranslateLoader, provideTranslateService } from '@ngx-translate/core';

import { routes } from './app.routes';
import { apiInterceptor } from './core/auth/api.interceptor';
import { AuthService } from './core/auth/auth.service';
import { JsonTranslateLoader } from './core/i18n';
import { LangService } from './core/lang.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideTranslateService({
      loader: provideTranslateLoader(JsonTranslateLoader),
      lang: 'km',
      fallbackLang: 'en',
    }),
    // Same outlined fields everywhere, like the prototype's bordered inputs.
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } },
    // Before the first screen: language, icon font, and the session from the refresh cookie (behind the splash).
    provideAppInitializer(() => {
      inject(LangService).init();
      inject(MatIconRegistry).setDefaultFontSetClass('icon');
      return inject(AuthService).init();
    }),
  ],
};
