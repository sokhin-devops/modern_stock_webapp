import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
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

  protected open(partner: Partner | null): void {
    this.editing.set(partner);
    this.formOpen.set(true);
  }
}
