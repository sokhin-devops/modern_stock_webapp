import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { PageQuery, pageParams } from '../catalog/catalog.service';
import { PageResponse } from './models';

/** Query values; empty ones (null, undefined, '') are left out. */
export type Filters = Record<string, string | number | boolean | null | undefined>;

/**
 * Plain calls to the API (environment.apiUrl + path) for the screens that only list, read and save. The interceptor
 * adds the token, business, branch and language headers.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(path: string, filters: Filters = {}): Observable<T> {
    return this.http.get<T>(this.base + path, { params: withFilters(new HttpParams(), filters) });
  }

  /** One page of a list, for LazyList. */
  page<T>(path: string, query: PageQuery, filters: Filters = {}): Observable<PageResponse<T>> {
    return this.http.get<PageResponse<T>>(this.base + path, { params: withFilters(pageParams(query), filters) });
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(this.base + path, body);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.base + path, body);
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.base + path, body);
  }

  delete<T = void>(path: string): Observable<T> {
    return this.http.delete<T>(this.base + path);
  }
}

function withFilters(params: HttpParams, filters: Filters): HttpParams {
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, value);
    }
  }
  return params;
}
