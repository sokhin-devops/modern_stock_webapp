import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { isHexColor, paletteCss } from '../../shared/colors';
import { Branch, BusinessProfile, MyBusiness, MyInvitation, Rate } from '../api/models';

const API = environment.apiUrl;
/** The business colors of the prototype (Settings: Appearance). */
export const PALETTES = ['blue', 'indigo', 'purple', 'teal', 'green'];
/** The <style> with the shades of an own business color. */
const CUSTOM_STYLE = 'ms-custom-palette';
const OPEN_KEY = 'ms-business';
const BRANCH_KEY = 'ms-branch';
const LAST_KEY = 'ms-last-business';

export interface CreateBusinessRequest {
  nameEn: string;
  nameKm?: string | null;
  businessType: string;
  phone?: string | null;
  language: 'km' | 'en';
}

export interface OnboardingRequest {
  mainBranch: { nameEn: string; nameKm?: string | null; phone?: string | null; address?: string | null };
  usdToKhr: number;
  vatEnabled: boolean;
  rielRounding: number;
  /** Starter units and categories for this kind of shop (FR-6.23); empty = the business's type. */
  starterType?: string | null;
  /** Also add the starter set's sample products. */
  sampleProducts?: boolean;
}

/**
 * The open business and the selected branch (PLAIN.md 11.11). Both are kept per browser tab (sessionStorage),
 * so two tabs can show two businesses; the last used business is remembered (localStorage) and opened after login.
 * The interceptor sends them as X-Business-Id and X-Branch-Id.
 */
@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  readonly businesses = signal<MyBusiness[] | null>(null);
  readonly invitations = signal<MyInvitation[]>([]);
  readonly businessId = signal<number | null>(readNumber(sessionStorageSafe(), OPEN_KEY));
  /** null = All branches. */
  readonly branchId = signal<number | null>(readNumber(sessionStorageSafe(), BRANCH_KEY));
  readonly branches = signal<Branch[]>([]);
  readonly rate = signal<Rate | null>(null);
  /** The open business's profile (name, contacts, color). */
  readonly profile = signal<BusinessProfile | null>(null);

  readonly current = computed(() => this.businesses()?.find((b) => b.id === this.businessId()) ?? null);
  readonly branch = computed(() => this.branches().find((b) => b.id === this.branchId()) ?? null);
  /** The branches the member works in (FR-6.18); null = all branches. */
  readonly workBranchIds = computed(() => this.current()?.branchIds ?? null);
  /** A member with one branch always works in it; others pick one of theirs or All (all of theirs). */
  readonly canPickBranch = computed(() => {
    const ids = this.workBranchIds();
    return ids == null || ids.length > 1;
  });
  /** The branches in the top bar's picker. */
  readonly pickableBranches = computed(() => {
    const ids = this.workBranchIds();
    return ids == null ? this.branches() : this.branches().filter((b) => ids.includes(b.id));
  });

  can(permission: string): boolean {
    return this.current()?.permissions.includes(permission) ?? false;
  }

  /** GET /me/businesses and the pending invitations sent to my email. */
  loadMine(): Observable<MyBusiness[]> {
    return forkJoin([
      this.http.get<MyBusiness[]>(`${API}/me/businesses`),
      this.http.get<MyInvitation[]>(`${API}/me/invitations`).pipe(catchError(() => of([]))),
    ]).pipe(
      tap(([businesses, invitations]) => {
        this.businesses.set(businesses);
        this.invitations.set(invitations);
      }),
      map(([businesses]) => businesses),
    );
  }

  /** After login: the business to open by itself, or null to show "My businesses". */
  pickAfterLogin(): number | null {
    const list = this.businesses() ?? [];
    if (list.length === 1) {
      return list[0].id;
    }
    const last = readNumber(localStorageSafe(), LAST_KEY);
    return list.some((b) => b.id === last) ? last : null;
  }

  open(id: number): void {
    if (this.businessId() !== id) {
      this.branchId.set(null);
      this.branches.set([]);
      this.rate.set(null);
      sessionStorageSafe()?.removeItem(BRANCH_KEY);
    }
    this.businessId.set(id);
    sessionStorageSafe()?.setItem(OPEN_KEY, String(id));
    localStorageSafe()?.setItem(LAST_KEY, String(id));
  }

  close(): void {
    this.businessId.set(null);
    this.branches.set([]);
    this.setProfile(null);
    sessionStorageSafe()?.removeItem(OPEN_KEY);
  }

  /**
   * The business profile, and its color on <html data-palette> (the prototype's palettes, which PrimeNG follows
   * through the theme preset). Blue is the default and needs no attribute. An own color (FR-6.26) is "custom", with
   * its shades written into a <style> of its own.
   */
  setProfile(profile: BusinessProfile | null): void {
    this.profile.set(profile);
    const color = profile?.themeColor;
    const root = this.document.documentElement;
    this.document.getElementById(CUSTOM_STYLE)?.remove();
    if (color && color !== 'blue' && PALETTES.includes(color)) {
      root.setAttribute('data-palette', color);
    } else if (isHexColor(color)) {
      const style = this.document.createElement('style');
      style.id = CUSTOM_STYLE;
      style.textContent = paletteCss(color);
      this.document.head.append(style);
      root.setAttribute('data-palette', 'custom');
    } else {
      root.removeAttribute('data-palette');
    }
  }

  /** Branches and today's rate for the top bar. The member's own branch, else the main branch, is selected first. */
  loadContext(): Observable<void> {
    return forkJoin([
      this.http.get<Branch[]>(`${API}/branches`),
      this.http.get<Rate>(`${API}/exchange-rates/current`).pipe(catchError(() => of(null))),
      this.http.get<BusinessProfile>(`${API}/business`).pipe(catchError(() => of(null))),
    ]).pipe(
      tap(([branches, rate, profile]) => {
        this.branches.set(branches.filter((b) => b.active));
        this.rate.set(rate);
        this.setProfile(profile);
        const mine = this.workBranchIds();
        const usable = mine == null ? branches : branches.filter((b) => mine.includes(b.id));
        const first = (usable.find((b) => b.main) ?? usable[0])?.id ?? null;
        const saved = this.branchId();
        if (mine != null && mine.length === 1) {
          this.selectBranch(mine[0]);
        } else if (saved != null && !usable.some((b) => b.id === saved)) {
          this.selectBranch(first);
        } else if (saved == null && sessionStorageSafe()?.getItem(BRANCH_KEY) == null) {
          this.selectBranch(first);
        }
      }),
      map(() => undefined),
    );
  }

  /** null = All branches. */
  selectBranch(id: number | null): void {
    this.branchId.set(id);
    sessionStorageSafe()?.setItem(BRANCH_KEY, id == null ? 'all' : String(id));
  }

  create(request: CreateBusinessRequest): Observable<MyBusiness> {
    return this.http.post<MyBusiness>(`${API}/me/businesses`, request).pipe(
      tap((b) => this.businesses.update((list) => [...(list ?? []), b])),
    );
  }

  /** PUT /business/onboarding, inside the new business (X-Business-Id). */
  onboard(request: OnboardingRequest): Observable<void> {
    return this.http.put(`${API}/business/onboarding`, request).pipe(
      tap(() => this.businesses.update((list) =>
        (list ?? []).map((b) => (b.id === this.businessId() ? { ...b, onboardingCompleted: true, status: 'ACTIVE' } : b)))),
      map(() => undefined),
    );
  }

  acceptInvitation(key: string | number): Observable<MyBusiness> {
    return this.http.post<MyBusiness>(`${API}/me/invitations/${key}/accept`, null);
  }

  declineInvitation(key: string | number): Observable<void> {
    return this.http.post<void>(`${API}/me/invitations/${key}/decline`, null);
  }
}

function sessionStorageSafe(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

function localStorageSafe(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function readNumber(storage: Storage | null, key: string): number | null {
  const value = storage?.getItem(key);
  return value && /^\d+$/.test(value) ? Number(value) : null;
}
