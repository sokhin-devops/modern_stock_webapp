import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Category, PageResponse, Product, ProductRequest, Unit } from '../api/models';
import { BusinessService } from '../business/business.service';
import { LangService } from '../lang.service';

const API = environment.apiUrl;

/** One page of a table: PrimeNG's lazy-load numbers turned into the API's page and sort. */
export interface PageQuery {
  page: number;
  size: number;
  /** For example "nameEn,asc". */
  sort?: string;
}

/**
 * Products, categories and units (PLAIN.md 11.1). Categories and units are few and used by many screens, so they
 * are loaded once per business and kept here; products are searched page by page.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);

  readonly categories = signal<Category[]>([]);
  readonly units = signal<Unit[]>([]);
  /** The business the lists above belong to. */
  private loadedFor: number | null = null;

  /** Category id → name in the current language. */
  readonly categoryName = computed(() => {
    const names = new Map<number, string>();
    this.categories().forEach((c) => names.set(c.id, this.lang.name(c.nameEn, c.nameKm)));
    return names;
  });

  /** Loads categories and units once per business (again after a business switch). */
  loadLists(force = false): void {
    const id = this.business.businessId();
    if (!force && id === this.loadedFor) {
      return;
    }
    this.loadedFor = id;
    this.http.get<Category[]>(`${API}/categories`).subscribe((list) => this.categories.set(list));
    this.http.get<Unit[]>(`${API}/units`).subscribe((list) => this.units.set(list));
  }

  searchProducts(query: PageQuery & { q?: string; categoryId?: number | null; active?: boolean }): Observable<PageResponse<Product>> {
    let params = pageParams(query);
    if (query.q) {
      params = params.set('q', query.q);
    }
    if (query.categoryId) {
      params = params.set('categoryId', query.categoryId);
    }
    if (query.active === false) {
      params = params.set('active', false);
    }
    return this.http.get<PageResponse<Product>>(`${API}/products`, { params });
  }

  getProduct(id: number): Observable<Product> {
    return this.http.get<Product>(`${API}/products/${id}`);
  }

  saveProduct(id: number | null, body: ProductRequest): Observable<Product> {
    return id == null
      ? this.http.post<Product>(`${API}/products`, body)
      : this.http.put<Product>(`${API}/products/${id}`, body);
  }

  /** Adds or replaces the product's photo (JPEG, PNG or WebP up to 2 MB). */
  uploadPhoto(id: number, file: File): Observable<Product> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Product>(`${API}/products/${id}/photo`, form);
  }

  removePhoto(id: number): Observable<Product> {
    return this.http.delete<Product>(`${API}/products/${id}/photo`);
  }

  /** Products are never deleted, only deactivated (their history stays). */
  deactivateProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/products/${id}`);
  }

  saveCategory(id: number | null, body: Omit<Category, 'id'>): Observable<Category> {
    const call = id == null
      ? this.http.post<Category>(`${API}/categories`, body)
      : this.http.put<Category>(`${API}/categories/${id}`, body);
    return call.pipe(tap(() => this.loadLists(true)));
  }

  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/categories/${id}`).pipe(tap(() => this.loadLists(true)));
  }

  saveUnit(id: number | null, body: Omit<Unit, 'id'>): Observable<Unit> {
    const call = id == null ? this.http.post<Unit>(`${API}/units`, body) : this.http.put<Unit>(`${API}/units/${id}`, body);
    return call.pipe(tap(() => this.loadLists(true)));
  }

  deleteUnit(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/units/${id}`).pipe(tap(() => this.loadLists(true)));
  }
}

/** page, size and sort as query parameters (Spring's Pageable). */
export function pageParams(query: PageQuery): HttpParams {
  let params = new HttpParams().set('page', query.page).set('size', query.size);
  if (query.sort) {
    params = params.set('sort', query.sort);
  }
  return params;
}
