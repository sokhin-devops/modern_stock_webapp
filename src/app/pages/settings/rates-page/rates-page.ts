import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { LazyList } from '../../../shared/lazy-list';

interface RateRow {
  id: number;
  rateDate: string;
  usdToKhr: number;
}

/**
 * Exchange rate (prototype rates.html, PLAIN.md 11.6): today's dollar-to-riel rate, a form to set the rate for a day,
 * and the history. Sales use the day's rate; without one, the last rate is used and the top bar warns.
 */
@Component({
  selector: 'ms-rates-page',
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe, TableModule, DatePicker, InputNumber, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './rates-page.html',
  styleUrl: './rates-page.scss',
})
export class RatesPage {
  private readonly api = inject(ApiService);
  protected readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);

  protected readonly canManage = computed(() => this.business.can('exchange_rate:manage'));
  protected readonly date = signal<Date>(new Date());
  protected readonly rate = signal<number | null>(this.business.rate()?.usdToKhr ?? 4100);
  protected readonly busy = signal(false);
  protected readonly list = new LazyList<RateRow>(
    (query) => this.api.page<RateRow>('/exchange-rates', query),
    (e) => this.notify.error(e),
    'rateDate,desc',
  );

  protected save(): void {
    const rate = this.rate();
    if (!rate || rate < 1000 || rate > 10000) {
      this.notify.show('1,000 – 10,000');
      return;
    }
    this.busy.set(true);
    this.api.post('/exchange-rates', { rateDate: toIsoDate(this.date()), usdToKhr: rate }).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey('common.saved');
        this.list.reload();
        // The top bar shows today's rate.
        this.business.loadContext().subscribe();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
