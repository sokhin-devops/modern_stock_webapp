import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';

import { ApiService } from '../../../core/api/api.service';
import { SaleLine } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { LazyList } from '../../../shared/lazy-list';
import { PaymentDialog } from '../../../shared/payment-dialog/payment-dialog';

interface Receipt {
  id: number;
  number: string;
  customerId: number | null;
  soldAt: string;
  exchangeRate: number;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  totalKhr: number;
  changeKhr: number;
  status: 'POSTED' | 'VOID';
  note: string | null;
  lines: SaleLine[];
  payments: { method: string; currency: string; amount: number }[];
}

interface Row {
  id: number;
  number: string;
  [key: string]: unknown;
}

/**
 * Customer transactions (prototype customer-transactions.html, PLAIN.md 11.7): sales receipts from the POS, invoices to
 * pay later, and payments received, each in a tab. A receipt opens with its lines and can be voided; payments are
 * received from the header.
 */
@Component({
  selector: 'ms-sales-page',
  imports: [TranslatePipe, DatePipe, DecimalPipe, CurrencyPipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, Drawer, ButtonDirective, ButtonIcon, ButtonLabel, PaymentDialog],
  templateUrl: './sales-page.html',
  styleUrl: './sales-page.scss',
})
export class SalesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly tab = signal<'receipts' | 'invoices' | 'payments'>('receipts');
  protected readonly canSell = computed(() => this.business.can('sale:create'));
  protected readonly canVoid = computed(() => this.business.can('sale:void'));

  private readonly onError = (e: unknown) => this.notify.error(e);
  protected readonly receipts = new LazyList<Receipt>((q) => this.api.page('/sales-receipts', q), this.onError, 'soldAt,desc');
  protected readonly invoices = new LazyList<Row>((q) => this.api.page('/invoices', q), this.onError, 'invoiceDate,desc');
  protected readonly payments = new LazyList<Row>((q) => this.api.page('/payments-received', q), this.onError, 'paidAt,desc');

  protected readonly viewing = signal<Receipt | null>(null);
  protected readonly payOpen = signal(false);

  protected voidSale(r: Receipt): void {
    this.confirm.confirm({
      header: this.translate.instant('sales.voidSale'),
      message: `${r.number} · $${r.total}`,
      acceptLabel: this.translate.instant('sales.voidSale'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () =>
        this.api.post<Receipt>(`/sales-receipts/${r.id}/void`, { reason: this.translate.instant('sales.voidSale') }).subscribe({
          next: (updated) => {
            this.viewing.set(updated);
            this.notify.showKey('sales.voided');
            this.receipts.refresh();
          },
          error: (e) => this.notify.error(e),
        }),
    });
  }

  protected reloadAll(): void {
    this.invoices.refresh();
    this.payments.refresh();
  }
}
