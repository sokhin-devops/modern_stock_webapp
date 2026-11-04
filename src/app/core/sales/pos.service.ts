import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  BarcodeLookup, BusinessSettings, CashShift, CheckoutRequest, CheckoutResponse, Customer, PageResponse,
} from '../api/models';

const API = environment.apiUrl;

/** The POS (PLAIN.md 11.4, 11.6): settings for the totals, barcode lookup, checkout, customers and cash shifts. */
@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly http = inject(HttpClient);

  settings(): Observable<BusinessSettings> {
    return this.http.get<BusinessSettings>(`${API}/business/settings`);
  }

  /** A scanned code; null when no product has it. */
  barcode(code: string, branchId: number | null): Observable<BarcodeLookup | null> {
    let params = new HttpParams();
    if (branchId != null) {
      params = params.set('branchId', branchId);
    }
    return this.http
      .get<BarcodeLookup>(`${API}/products/barcode/${encodeURIComponent(code)}`, { params })
      .pipe(catchError((e) => (e instanceof HttpErrorResponse && e.status === 404 ? of(null) : throwError(() => e))));
  }

  checkout(body: CheckoutRequest): Observable<CheckoutResponse> {
    return this.http.post<CheckoutResponse>(`${API}/pos/checkout`, body);
  }

  customers(q: string): Observable<PageResponse<Customer>> {
    return this.http.get<PageResponse<Customer>>(`${API}/customers`, { params: { q, size: 10 } });
  }

  /** My open shift in the branch, or null. */
  currentShift(branchId: number): Observable<CashShift | null> {
    return this.http
      .get<CashShift>(`${API}/cash-shifts/current`, { params: { branchId } })
      .pipe(catchError((e) => (e instanceof HttpErrorResponse && e.status === 404 ? of(null) : throwError(() => e))));
  }

  openShift(branchId: number, openingUsd: number, openingKhr: number): Observable<CashShift> {
    return this.http.post<CashShift>(`${API}/cash-shifts/open`, { branchId, openingUsd, openingKhr });
  }

  closeShift(id: number, countedUsd: number, countedKhr: number, note: string | null): Observable<CashShift> {
    return this.http.post<CashShift>(`${API}/cash-shifts/${id}/close`, { countedUsd, countedKhr, note });
  }
}
