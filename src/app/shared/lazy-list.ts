import { signal } from '@angular/core';
import { TableLazyLoadEvent } from 'primeng/table';
import { Observable } from 'rxjs';

import { PageResponse } from '../core/api/models';
import { PageQuery } from '../core/catalog/catalog.service';

/**
 * The state of a list that the API pages (a PrimeNG table with [lazy]="true"): rows, total, loading, and the page the
 * table asked for. Bind (onLazyLoad)="list.load($event)" and [first]="list.first()"; call reload() after a filter
 * changes or a row is saved.
 */
export class LazyList<T> {
  readonly rows = signal<T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly first = signal(0);
  private last: TableLazyLoadEvent = { first: 0, rows: 20 };

  constructor(
    private readonly fetch: (query: PageQuery) => Observable<PageResponse<T>>,
    private readonly onError: (error: unknown) => void,
    private readonly defaultSort?: string,
  ) {}

  load(event: TableLazyLoadEvent): void {
    this.last = event;
    const size = event.rows ?? 20;
    const field = typeof event.sortField === 'string' ? event.sortField : null;
    this.loading.set(true);
    this.fetch({
      page: Math.floor((event.first ?? 0) / size),
      size,
      sort: field ? `${field},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.defaultSort,
    }).subscribe({
      next: (page) => {
        this.rows.set(page.content);
        this.total.set(page.totalElements);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.onError(e);
      },
    });
  }

  /** Back to the first page (after a filter change). */
  reload(): void {
    this.first.set(0);
    this.load({ ...this.last, first: 0 });
  }

  /** The same page again (after a save). */
  refresh(): void {
    this.load(this.last);
  }
}
