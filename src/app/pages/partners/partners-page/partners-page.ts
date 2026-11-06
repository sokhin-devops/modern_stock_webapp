import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { LazyList } from '../../../shared/lazy-list';
import { exportList } from '../../../shared/list-export';
import { Partner, PartnerForm, PartnerKind } from '../partner-form/partner-form';

/**
 * Customers or suppliers (prototype customers.html / suppliers.html, PLAIN.md 11.7): search by name or phone, the
 * balance each one owes or is owed, and a dialog to add or edit. The route path says which of the two it is.
 */
@Component({
  selector: 'ms-partners-page',
  imports: [TranslatePipe, CurrencyPipe, TableModule, IconField, InputIcon, InputText, ButtonDirective, ButtonIcon, ButtonLabel, PartnerForm],
  templateUrl: './partners-page.html',
  styleUrl: './partners-page.scss',
})
export class PartnersPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly kind: PartnerKind = inject(ActivatedRoute).snapshot.routeConfig?.path === 'suppliers' ? 'supplier' : 'customer';
  protected readonly isCustomer = this.kind === 'customer';
  protected readonly canAdd = computed(() =>
    this.isCustomer ? this.business.can('customer:manage') || this.business.can('customer:create_pos') : this.business.can('supplier:manage'),
  );

  private readonly q = signal('');
  private readonly search = new Subject<string>();
  protected readonly list = new LazyList<Partner>(
    (query) => this.api.page<Partner>(this.isCustomer ? '/customers' : '/suppliers', query, { q: this.q() }),
    (e) => this.notify.error(e),
  );

  /** Members who see customers (suppliers) open their page; a Cashier who only adds customers at the POS edits. */
  protected readonly canView = computed(() => this.business.can(this.isCustomer ? 'customer:view' : 'supplier:view'));
  protected readonly exporting = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Partner | null>(null);

  constructor() {
    this.search.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef))).subscribe((q) => {
      this.q.set(q.trim());
      this.list.reload();
    });
    let firstRun = true;
    effect(() => {
      this.business.businessId();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => this.list.reload());
    });
  }

  protected onSearch(value: string): void {
    this.search.next(value);
  }

  /** A row opens the customer's (supplier's) page: summary, Transactions, Statement (PLAIN.md 12.2). */
  protected open(partner: Partner): void {
    if (this.canView()) {
      void this.router.navigate([this.isCustomer ? '/customers' : '/suppliers', partner.id]);
    } else {
      this.editing.set(partner);
      this.formOpen.set(true);
    }
  }

  protected add(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  /** A new customer (supplier) opens on their page; a change stays in the list. */
  protected saved(p: Partner): void {
    const isNew = !this.editing();
    this.list.refresh();
    if (isNew && this.canView()) {
      void this.router.navigate([this.isCustomer ? '/customers' : '/suppliers', p.id]);
    }
  }

  protected async exportAll(): Promise<void> {
    const t = (key: string) => this.translate.instant(key);
    this.exporting.set(true);
    try {
      await exportList<Partner>(
        (page, size) => this.api.page<Partner>(this.isCustomer ? '/customers' : '/suppliers', { page, size, sort: 'name,asc' }, { q: this.q() }),
        [
          { header: t('partners.name'), value: (p) => p.name },
          this.isCustomer
            ? { header: t('partners.type'), value: (p) => t('partners.' + (p as { type: string }).type) }
            : { header: t('partners.contact'), value: (p) => (p as { contactPerson: string | null }).contactPerson },
          { header: t('partners.phone'), value: (p) => p.phone },
          { header: t('party.address'), value: (p) => p.address },
          { header: t('partners.balance'), value: (p) => p.balance, format: '#,##0.00' },
          { header: t('party.overdue'), value: (p) => p.overdue ?? 0, format: '#,##0.00' },
          { header: t('common.status'), value: (p) => t(p.active ? 'partners.active' : 'partners.inactive') },
        ],
        this.isCustomer ? 'customers' : 'suppliers',
      );
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.exporting.set(false);
    }
  }
}
