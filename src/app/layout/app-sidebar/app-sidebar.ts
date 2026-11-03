import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { BusinessService } from '../../core/business/business.service';
import { NAV, NavItem, NavPage } from '../nav';

/**
 * Side menu (prototype sidebar): Dashboard and POS, a thin line, then the groups. Only pages the member's role
 * allows are shown; a group with nothing allowed disappears. The group of the current page opens by itself.
 * Collapsed to icons, a group's pages open in a flyout menu beside it (the prototype's pop-nav).
 */
@Component({
  selector: 'ms-app-sidebar',
  imports: [
    RouterLink, RouterLinkActive, TranslatePipe, MatIcon, MatTooltip, MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger,
  ],
  templateUrl: './app-sidebar.html',
  styleUrl: './app-sidebar.scss',
})
export class AppSidebar {
  readonly collapsed = input(false);
  readonly collapse = output<void>();
  readonly navigate = output<void>();

  private readonly business = inject(BusinessService);
  private readonly router = inject(Router);

  /** Groups opened by hand; the group of the current page is always open. */
  private readonly opened = signal<Set<string>>(new Set());
  private readonly url = signal(this.router.url);

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

  private allowed(page: NavPage): boolean {
    return !page.permissions?.length || page.permissions.some((p) => this.business.can(p));
  }
}
