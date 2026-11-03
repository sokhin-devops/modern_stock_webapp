import { TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';

import en from '../../i18n/en.json';
import km from '../../i18n/km.json';

/** Translations are bundled, so the first screen never shows untranslated keys. */
export class JsonTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<TranslationObject> {
    return of((lang === 'en' ? en : km) as TranslationObject);
  }
}
