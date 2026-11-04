import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { MovementRow, PageResponse, ProductStock, StockRow } from '../api/models';
import { PageQuery, pageParams } from '../catalog/catalog.service';

const API = environment.apiUrl;

/**
 * Stock on hand, per product and per warehouse and batch, and the stock card (PLAIN.md 11.2). Numbers are for the
 * branch picked in the top bar, or all branches the member sees (the interceptor sends X-Branch-Id).
 */
@Injectable({ providedIn: 'root' })
export class StockService {
  private readonly http = inject(HttpClient);

  levels(query: PageQuery & { q?: string; categoryId?: number | null }): Observable<PageResponse<StockRow>> {
    let params = pageParams(query);
    if (query.q) {
      params = params.set('q', query.q);
    }
    if (query.categoryId) {
      params = params.set('categoryId', query.categoryId);
    }
    return this.http.get<PageResponse<StockRow>>(`${API}/stock/levels`, { params });
  }

  /** Products at or below their reorder level (one list, not paged). */
  low(): Observable<StockRow[]> {
    return this.http.get<StockRow[]>(`${API}/stock/low`);
  }

  product(productId: number): Observable<ProductStock> {
    return this.http.get<ProductStock>(`${API}/stock/levels/${productId}`);
  }

  movements(query: PageQuery & { productId: number }): Observable<PageResponse<MovementRow>> {
    return this.http.get<PageResponse<MovementRow>>(`${API}/stock/movements`, {
      params: pageParams(query).set('productId', query.productId),
    });
  }
}
