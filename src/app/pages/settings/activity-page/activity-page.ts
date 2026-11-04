import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DatePicker } from 'primeng/datepicker';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { LazyList } from '../../../shared/lazy-list';

interface ActivityEntry {
  id: number;
  at: string;
  userId: number | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  /** What it is about, as it was named then (a product name, a document number). */
  label: string | null;
  branchId: number | null;
  branchName: string | null;
  /** Only the values that changed. */
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

/** One line of an entry: "Price: $0.75 → $0.80", or a single value ("Reason: Wrong item"). */
interface Change {
  field: string;
  before: string | null;
  after: string | null;
}

const TYPES = [
  'PRODUCT', 'SALES_RECEIPT', 'SALES_ORDER', 'CUSTOMER', 'PURCHASE_ORDER', 'EXPENSE', 'ADJUSTMENT', 'STOCK_COUNT', 'TRANSFER',
  'CASH_SHIFT', 'MEMBER', 'INVITATION', 'ROLE', 'SETTINGS', 'BUSINESS', 'EXCHANGE_RATE', 'SUBSCRIPTION',
];
/** Fields shown as dollars or riel. */
const USD = /^(sellPrice|total|value|amountUsd|creditLimit|cashUsd)(\.|$)/;
const KHR = /^(cashKhr|usdToKhr)$/;

/**
 * Activity log (FR-6.22): who did what and when, newest first, with the old and new values of what changed: prices,
 * voids, members and roles, settings, rates, stock approvals. Owners see everything; a member of some branches sees
 * those branches' entries.
 */
@Component({
  selector: 'ms-activity-page',
  imports: [FormsModule, TranslatePipe, DatePipe, TableModule, IconField, InputIcon, InputText, Select, DatePicker],
  templateUrl: './activity-page.html',
  styleUrl: './activity-page.scss',
})
export class ActivityPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);

  protected readonly q = signal('');
  protected readonly type = signal<string | null>(null);
  protected readonly userId = signal<number | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly list = new LazyList<ActivityEntry>(
    (query) =>
      this.api.page('/activity', query, {
        q: this.q() || null,
        entityType: this.type(),
        userId: this.userId(),
        from: toIsoDate(this.from()),
        to: toIsoDate(this.to()),
      }),
    (e) => this.notify.error(e),
  );
  protected readonly types = computed(() =>
    TYPES.map((t) => ({ value: t, label: this.translate.instant(`activity.types.${t}`) })).sort((a, b) => a.label.localeCompare(b.label)),
  );
  protected readonly people = signal<{ value: number; label: string }[]>([]);
  private readonly search = new Subject<string>();

  constructor() {
    if (this.business.can('member:view')) {
      this.api.get<{ userId: number; fullName: string }[]>('/members').subscribe({
        next: (list) => this.people.set(list.map((m) => ({ value: m.userId, label: m.fullName }))),
      });
    }
    this.search.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef))).subscribe((q) => {
      this.q.set(q.trim());
      this.list.reload();
    });
  }

  protected onSearch(value: string): void {
    this.search.next(value);
  }

  protected set<T>(target: { set(value: T): void }, value: T): void {
    target.set(value);
    this.list.reload();
  }

  protected what(e: ActivityEntry): string {
    return this.translate.instant(`activity.actions.${e.action}`);
  }

  protected about(e: ActivityEntry): string {
    return e.label ?? (e.entityType === 'INVITATION' ? this.translate.instant('activity.inviteLink') : '');
  }

  /**
   * The changed values, old → new. Something created, voided or removed has values on one side only, and so do a
   * role's added and removed permissions: those show alone.
   */
  protected changes(e: ActivityEntry): Change[] {
    const before = e.oldValues ?? {};
    const after = e.newValues ?? {};
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.map((key) => {
      const field = this.field(key);
      if (key === 'removed' || e.newValues == null) {
        return { field, before: null, after: this.value(key, before[key]) };
      }
      if (key === 'added' || e.oldValues == null) {
        return { field, before: null, after: this.value(key, after[key]) };
      }
      return { field, before: this.value(key, before[key]), after: this.value(key, after[key]) };
    });
  }

  /** "sellPrice.box" → "Price (box)"; a key without a label (a branch name) shows as it is. */
  private field(key: string): string {
    const [head, ...rest] = key.split('.');
    const path = `activity.fields.${head}`;
    const label = this.translate.instant(path);
    if (label === path) {
      return key;
    }
    return rest.length ? `${label} (${rest.join('.')})` : label;
  }

  private value(key: string, value: unknown): string {
    if (value == null || value === '') {
      return key === 'branch' ? this.translate.instant('settings.members.allBranches') : '—';
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.permission(String(v))).join(', ');
    }
    if (typeof value === 'boolean') {
      return this.translate.instant(value ? 'common.yes' : 'common.no');
    }
    if (typeof value === 'number') {
      const head = key.split('.')[0];
      if (USD.test(key) || USD.test(head)) {
        return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
      }
      return (KHR.test(key) ? '៛' : '') + value.toLocaleString('en-US', { maximumFractionDigits: 3 });
    }
    const text = String(value);
    const known = key === 'reason' ? `adjust.reasons.${text}` : key === 'status' ? `settings.members.${text}` : null;
    if (known && this.translate.instant(known) !== known) {
      return this.translate.instant(known);
    }
    return text;
  }

  private permission(code: string): string {
    const path = `roles.perm.${code}`;
    const label = this.translate.instant(path);
    return label === path ? code : label;
  }
}
