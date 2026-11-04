import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { BusinessService } from '../business/business.service';
import { LangService } from '../lang.service';
import { AuthService } from './auth.service';

/** Endpoints that don't belong to a business (PLAIN.md 11.11): no X-Business-Id on them. */
const ACCOUNT_PATHS = ['/auth/', '/me/', '/public/', '/admin/'];

/**
 * Every API call gets the access token, the open business and branch, and the language (PLAIN.md 8).
 * On 401 it refreshes the token once and repeats the call; if the session can't be refreshed, the user signs in again.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }
  const auth = inject(AuthService);
  const business = inject(BusinessService);
  const lang = inject(LangService);
  const path = req.url.slice(environment.apiUrl.length);
  const isAuthCall = path.startsWith('/auth/');

  const prepare = (token: string | null): HttpRequest<unknown> => {
    let headers = req.headers.set('Accept-Language', lang.lang());
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    const businessId = business.businessId();
    // "/me" itself or below it (not "/members", which needs the business).
    if (businessId != null && path !== '/me' && !ACCOUNT_PATHS.some((p) => path.startsWith(p))) {
      headers = headers.set('X-Business-Id', String(businessId)).set('X-Branch-Id', String(business.branchId() ?? 'all'));
    }
    return req.clone({ headers });
  };

  return next(prepare(auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthCall && auth.accessToken()) {
        return auth.refresh().pipe(
          switchMap((token) => {
            if (!token) {
              auth.sessionExpired();
              return throwError(() => error);
            }
            return next(prepare(token));
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
