import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from './api/api.service';

export interface Announcement {
  en: string;
  km: string;
  level: 'INFO' | 'WARN';
}

interface PlatformInfo {
  trialDays: number;
  announcement: Announcement | null;
}

/** Reload every 10 minutes, so a maintenance notice reaches screens that stay open all day. */
const EVERY_MS = 10 * 60_000;
/** The announcement closed in this browser tab (closed again only when it changes). */
const DISMISSED = 'ms.announcement.dismissed';

/**
 * What the super admin sets for the whole platform (FR-8.8, FR-8.10): the trial length for the sign-up texts and the
 * announcement banner over the app (GET /public/platform, no login needed). Loaded by the first screen that asks.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly api = inject(ApiService);

  private readonly info = signal<PlatformInfo | null>(null);
  private readonly dismissed = signal<string | null>(read());
  private started = false;

  readonly trialDays = computed(() => this.info()?.trialDays ?? 30);
  /** The banner to show, unless it was closed in this tab. */
  readonly announcement = computed(() => {
    const a = this.info()?.announcement;
    return a && key(a) !== this.dismissed() ? a : null;
  });

  load(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.fetch();
    setInterval(() => this.fetch(), EVERY_MS);
  }

  dismiss(): void {
    const a = this.info()?.announcement;
    if (!a) {
      return;
    }
    this.dismissed.set(key(a));
    try {
      sessionStorage.setItem(DISMISSED, key(a));
    } catch {
      // storage blocked: closed until the next reload
    }
  }

  private fetch(): void {
    this.api.get<PlatformInfo>('/public/platform').subscribe({
      next: (info) => this.info.set(info),
      error: () => undefined, // a convenience: without it the app works the same
    });
  }
}

function key(a: Announcement): string {
  return `${a.level}|${a.en}|${a.km}`;
}

function read(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED);
  } catch {
    return null;
  }
}
