import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { NotifyService } from '../../../core/notify.service';

interface TelegramSettings {
  connected: boolean;
  chatTitle: string | null;
  dailySummary: boolean;
  lowStockAlerts: boolean;
  expiryAlerts: boolean;
  outOfStockAlerts: boolean;
  shiftShortAlerts: boolean;
  voidAlerts: boolean;
  botConfigured: boolean;
  planIncludes: boolean;
}

interface Connect {
  code: string;
  botUsername: string;
  privateLink: string;
  groupLink: string;
  expiresAt: string;
}

/** While connecting, the page asks every 3 seconds whether Telegram has confirmed the chat. */
const CHECK_MS = 3000;

/**
 * Telegram (prototype telegram.html, PLAIN.md 11.10): connect a chat or group with a one-time link (Telegram tells the
 * API which chat it is, nobody types an ID), choose what the daily 07:00 summary includes, and send a test or
 * yesterday's summary now. The bot belongs to the server; without one, or on a plan without Telegram, the page says so.
 */
@Component({
  selector: 'ms-telegram-page',
  imports: [FormsModule, RouterLink, TranslatePipe, DatePipe, ToggleSwitch, ProgressSpinner, ButtonDirective, ButtonIcon, ButtonLabel],
  templateUrl: './telegram-page.html',
  styleUrl: './telegram-page.scss',
})
export class TelegramPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly s = signal<TelegramSettings | null>(null);
  protected readonly connecting = signal<Connect | null>(null);
  protected readonly busy = signal<'save' | 'connect' | 'test' | 'summary' | 'disconnect' | null>(null);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => this.stopWaiting());
  }

  protected set<K extends 'dailySummary' | 'lowStockAlerts' | 'expiryAlerts' | 'outOfStockAlerts' | 'shiftShortAlerts' | 'voidAlerts'>(
    key: K,
    value: boolean,
  ): void {
    this.s.update((s) => (s ? { ...s, [key]: value } : s));
  }

  /** Gets a one-time link, then waits for Telegram to confirm the chat. */
  protected connect(): void {
    this.busy.set('connect');
    this.api.post<Connect>('/business/telegram/connect').subscribe({
      next: (c) => {
        this.busy.set(null);
        this.connecting.set(c);
        this.stopWaiting();
        this.timer = setInterval(() => this.check(), CHECK_MS);
      },
      error: (e) => this.fail(e),
    });
  }

  protected cancelConnect(): void {
    this.stopWaiting();
    this.connecting.set(null);
  }

  protected disconnect(): void {
    this.busy.set('disconnect');
    this.api.post<TelegramSettings>('/business/telegram/disconnect').subscribe({
      next: (s) => {
        this.busy.set(null);
        this.s.set(s);
        this.notify.showKey('telegram.disconnected');
      },
      error: (e) => this.fail(e),
    });
  }

  protected save(): void {
    const s = this.s();
    if (!s) {
      return;
    }
    this.busy.set('save');
    this.api.put<TelegramSettings>('/business/telegram', s).subscribe({
      next: (r) => {
        this.busy.set(null);
        this.s.set(r);
        this.notify.showKey('settings.saved');
      },
      error: (e) => this.fail(e),
    });
  }

  protected send(what: 'test' | 'summary'): void {
    this.busy.set(what);
    this.api.post(`/business/telegram/${what}`).subscribe({
      next: () => {
        this.busy.set(null);
        this.notify.showKey(what === 'test' ? 'telegram.testSent' : 'telegram.summarySent');
      },
      error: (e) => this.fail(e),
    });
  }

  private check(): void {
    const c = this.connecting();
    if (!c || new Date(c.expiresAt).getTime() < Date.now()) {
      this.cancelConnect();
      return;
    }
    this.api.get<TelegramSettings>('/business/telegram').subscribe((s) => {
      if (s.connected) {
        this.cancelConnect();
        this.s.set(s);
        this.notify.showKey('telegram.connectedToast');
      }
    });
  }

  private load(): void {
    this.api.get<TelegramSettings>('/business/telegram').subscribe({ next: (s) => this.s.set(s), error: (e) => this.notify.error(e) });
  }

  private stopWaiting(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private fail(e: unknown): void {
    this.busy.set(null);
    this.notify.error(e);
  }
}
