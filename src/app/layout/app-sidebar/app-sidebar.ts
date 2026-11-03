import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { Tooltip } from 'primeng/tooltip';
import { filter } from 'rxjs';

import { BusinessService } from '../../core/business/business.service';
import { ScreenService } from '../../core/screen.service';
import { NAV, NavItem, NavPage } from '../nav';

/**
 * Side menu (prototype sidebar): Dashboard and POS, a thin line, then the groups. Only pages the member's role
 * allows are shown; a group with nothing allowed disappears. The group of the current page opens by itself.
 * As a rail of icons (collapsed by hand, or always on tablets), a group's pages open in a flyout menu beside it
 * (the prototype's pop-nav).
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

  /** Groups opened by hand; the group of the current page is always open. */
  private readonly opened = signal<Set<string>>(new Set());
  private readonly url = signal(this.router.url);

  /** The pages of the group whose flyout is open, and the icon it opened from. */
  protected readonly flyoutItems = signal<MenuItem[]>([]);
  private flyoutTarget: HTMLElement | null = null;

  protected readonly items = computed<NavItem[]>(() => {
    this.business.current(); // re-filter when the business (and so the role) changes
    return NAV.map((item) => (item.children ? { ...item, children: item.children.filter((p) => this.allowed(p)) } : item))
      .filter((item) => (item.children ? item.children.length > 0 : this.allowed(item as NavPage)));
  });

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.url.set(this.router.url));
  }

  protected isOpen(item: NavItem): boolean {
    return this.opened().has(item.id) || this.isCurrent(item);
  }

  /** The group holding the current page (highlighted when the menu shows icons only). */
  protected isCurrent(item: NavItem): boolean {
    return !!item.children?.some((p) => this.url().startsWith('/' + p.path));
  }

  protected toggle(item: NavItem): void {
    this.opened.update((set) => {
      const next = new Set(set);
      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
      return next;
    });
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
