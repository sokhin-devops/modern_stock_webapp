import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../../core/api/api.service';
import { CashShift } from '../../../core/api/models';
import { NotifyService } from '../../../core/notify.service';
import { LazyList } from '../../../shared/lazy-list';

/**
 * Cash shifts (prototype shifts.html, PLAIN.md 11.5): each cashier's shifts with the cash that should be in the drawer,
 * what was counted, and the difference (over or short). Cashiers see their own; managers see everyone's.
 */
@Component({
  selector: 'ms-shifts-page',
  imports: [TranslatePipe, DatePipe, DecimalPipe, TableModule],
  templateUrl: './shifts-page.html',
  styleUrl: './shifts-page.scss',
})
export class ShiftsPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly list = new LazyList<CashShift>((q) => this.api.page('/cash-shifts', q), (e) => this.notify.error(e), 'openedAt,desc');
}
