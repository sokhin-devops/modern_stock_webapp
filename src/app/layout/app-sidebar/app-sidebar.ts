import { Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { Tooltip } from 'primeng/tooltip';
import { filter, map } from 'rxjs';

import { BusinessService } from '../../core/business/business.service';
import { ScreenService } from '../../core/screen.service';
import { NAV, NavItem, NavPage } from '../nav';

/**
 * Side menu (prototype sidebar): Dashboard and POS, a thin line, then the groups. Only pages the member's role
 * allows are shown; a group with nothing allowed disappears.
 * Groups work like the prototype's accordion: one is open at a time, any of them (also the current one) can be
 * closed, and going to a page in another group opens that group. As a rail of icons (collapsed by hand, or always
 * on tablets), a group's pages open in a flyout menu beside it (the prototype's pop-nav).
 */
@Component({
  selector: 'ms-app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, Menu, Tooltip],
  templateUrl: './app-sidebar.html',
  styleUrl: './app-sidebar.scss',
})
export class AppSidebar {
  /** Icons only: collapsed by hand on a computer, or a tablet (see AppShell). */
  readonly rail = input(false);
  readonly collapse = output<void>();
  readonly navigate = output<void>();

  protected readonly screen = inject(ScreenService);
  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly flyout = viewChild.required<Menu>('flyout');

  /** The one open group (null = all closed). */
  protected readonly openGroup = signal<string | null>(null);
  /** The page's path, without query or fragment. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => pathOf(this.router.url)),
    ),
    { initialValue: pathOf(this.router.url) },
  );
  /** The group of the page shown last, to open a group only when the page moves to another one. */
  private lastCurrent: string | null = null;

  /** The pages of the group whose flyout is open, and the icon it opened from. */
  protected readonly flyoutItems = signal<MenuItem[]>([]);
  private flyoutTarget: HTMLElement | null = null;

  protected readonly items = computed<NavItem[]>(() => {
    this.business.current(); // re-filter when the business (and so the role) changes
    return NAV.map((item) => (item.children ? { ...item, children: item.children.filter((p) => this.allowed(p)) } : item))
      .filter((item) => (item.children ? item.children.length > 0 : this.allowed(item as NavPage)));
  });

  constructor() {
    // Opens the group of the page when the page moves into another group (also once the role's pages are known);
    // inside one group, it stays open or closed as the member left it.
    effect(() => {
      const current = this.items().find((item) => this.isCurrent(item))?.id ?? null;
      if (current !== this.lastCurrent) {
        this.lastCurrent = current;
        if (current) {
          this.openGroup.set(current);
        }
      }
    });
  }

  protected isOpen(item: NavItem): boolean {
    return this.openGroup() === item.id;
  }

  /** The group holding the current page (highlighted when closed, and when the menu shows icons only). */
  protected isCurrent(item: NavItem): boolean {
    const path = this.path();
    return !!item.children?.some((p) => path === '/' + p.path || path.startsWith('/' + p.path + '/'));
  }

  /** Opens a group (closing the one that was open) or closes it; an opened group scrolls into view. */
  protected toggle(item: NavItem, event: Event): void {
    const opening = this.openGroup() !== item.id;
    this.openGroup.set(opening ? item.id : null);
    if (opening) {
      const group = (event.currentTarget as HTMLElement).parentElement;
      // After the opening animation (0.28 s), so the whole group is measured.
      setTimeout(() => group?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
    }
  }

  protected openFlyout(event: MouseEvent, item: NavItem): void {
    this.flyoutTarget = event.currentTarget as HTMLElement;
    this.flyoutItems.set([
      {
        label: this.translate.instant(item.label),
        items: (item.children ?? []).map((page) => ({
          label: this.translate.instant(page.label),
          routerLink: '/' + page.path,
          routerLinkActiveOptions: { exact: true },
        })),
      },
    ]);
    this.flyout().toggle(event);
  }

  /** PrimeNG opens popup menus under the button; the flyout goes beside the icon instead, like the prototype. */
  protected placeFlyout(): void {
    queueMicrotask(() => {
      const panel = this.flyout().container;
      const target = this.flyoutTarget;
      if (!panel || !target) {
        return;
      }
      const box = target.getBoundingClientRect();
      const top = Math.max(8, Math.min(box.top, window.innerHeight - panel.offsetHeight - 8));
      panel.style.left = `${box.right + 8 + window.scrollX}px`;
      panel.style.top = `${top + window.scrollY}px`;
      panel.style.transformOrigin = 'left top';
    });
  }

  private allowed(page: NavPage): boolean {
    return !page.permissions?.length || page.permissions.some((p) => this.business.can(p));
  }
}

function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}
