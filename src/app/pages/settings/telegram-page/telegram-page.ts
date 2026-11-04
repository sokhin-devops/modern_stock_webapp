import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';

interface TelegramSettings {
  chatId: string;
  dailySummary: boolean;
  lowStockAlerts: boolean;
  expiryAlerts: boolean;
  botConfigured: boolean;
}

/**
 * Telegram (prototype telegram.html, PLAIN.md 11.14): the chat that gets the evening sales summary and the stock
 * alerts, and a test message. The bot belongs to the server; without one, the page says so and only saves.
 */
@Component({
  selector: 'ms-telegram-page',
  imports: [FormsModule, TranslatePipe, InputText, ToggleSwitch, ButtonDirective, ButtonIcon, ButtonLabel, FieldLabel],
  templateUrl: './telegram-page.html',
  styleUrl: './telegram-page.scss',
})
export class TelegramPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly s = signal<TelegramSettings>({ chatId: '', dailySummary: true, lowStockAlerts: true, expiryAlerts: true, botConfigured: false });
  protected readonly busy = signal(false);

  constructor() {
    this.api.get<TelegramSettings>('/business/telegram').subscribe({ next: (s) => this.s.set(s), error: (e) => this.notify.error(e) });
  }

  protected set<K extends keyof TelegramSettings>(key: K, value: TelegramSettings[K]): void {
    this.s.update((s) => ({ ...s, [key]: value }));
  }

  protected save(): void {
    this.busy.set(true);
    this.api.put<TelegramSettings>('/business/telegram', this.s()).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.s.set(s);
        this.notify.showKey('settings.saved');
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected test(): void {
    this.api.post('/business/telegram/test').subscribe({
      next: () => this.notify.showKey('telegram.testSent'),
      error: (e) => this.notify.error(e),
    });
  }
}
