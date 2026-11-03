import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';

import { BusinessService } from '../business/business.service';
import { AuthService } from './auth.service';

/** Account and business pages need a login; afterwards the user comes back to the page they asked for. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.loggedIn() || inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Login and sign-up pages: someone who is already logged in goes to their businesses. */
export const guestGuard: CanActivateFn = () =>
  !inject(AuthService).loggedIn() || inject(Router).createUrlTree(['/businesses']);

/**
 * Business pages (PLAIN.md 8): no open business → My businesses; setup not finished → the setup page.
 * Loads the branches and today's rate for the top bar on the way in.
 */
export const businessGuard: CanActivateFn = () => {
  const business = inject(BusinessService);
  const router = inject(Router);
  const list$ = business.businesses() ? of(business.businesses()!) : business.loadMine();
  return list$.pipe(
    switchMap(() => {
      const current = business.current();
      if (!current) {
        business.close();
        return of(router.createUrlTree(['/businesses']));
      }
      if (!current.onboardingCompleted) {
        return of(router.createUrlTree(['/setup']));
      }
      return business.branches().length ? of(true) : business.loadContext().pipe(map(() => true));
    }),
    catchError(() => of(router.createUrlTree(['/businesses']))),
  );
};

/** The setup page is only for an open business that isn't set up yet. */
export const setupGuard: CanActivateFn = () => {
  const business = inject(BusinessService);
  const router = inject(Router);
  const list$ = business.businesses() ? of(business.businesses()!) : business.loadMine();
  return list$.pipe(
    map(() => {
      const current = business.current();
      if (!current) {
        return router.createUrlTree(['/businesses']);
      }
      return current.onboardingCompleted ? router.createUrlTree(['/dashboard']) : true;
    }),
  );
};

/** Screens that need a permission (route data "permissions", any one is enough). The API checks again; this only hides the screen. */
export const permissionGuard: CanActivateFn = (route) => {
  const permissions = (route.data['permissions'] as string[] | undefined) ?? [];
  const business = inject(BusinessService);
  return !permissions.length || permissions.some((p) => business.can(p)) || inject(Router).createUrlTree(['/dashboard']);
};
