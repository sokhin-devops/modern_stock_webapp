import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { Lang } from './api/models';

const KEY = 'ms-lang';

/**
 * The app language. The website opens the app with ?lang=km or ?lang=en (PLAIN.md 8); otherwise the last choice
 * on this browser is used, then Khmer. API errors follow it too (Accept-Language).
 */
@Injectable({ providedIn: 'root' })
export class LangService {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  readonly lang = signal<Lang>('km');

  init(): void {
    const fromUrl = new URLSearchParams(this.document.defaultView?.location.search ?? '').get('lang');
    const saved = read();
    this.set(fromUrl === 'en' || fromUrl === 'km' ? fromUrl : (saved ?? 'km'));
  }

  set(lang: Lang): void {
    this.lang.set(lang);
    this.translate.use(lang);
    this.document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }

  toggle(): void {
    this.set(this.lang() === 'km' ? 'en' : 'km');
  }

  /** A Khmer name when there is one and the app is in Khmer, else the English name. */
  name(en: string, km: string | null | undefined): string {
    return this.lang() === 'km' && km ? km : en;
  }
}

function read(): Lang | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'en' || value === 'km' ? value : null;
  } catch {
    return null;
  }
}
