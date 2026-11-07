import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonDirective, ButtonIcon } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { Popover } from 'primeng/popover';
import { Ripple } from 'primeng/ripple';
import { Tooltip } from 'primeng/tooltip';
import { filter, map } from 'rxjs';

import { ALERT_TARGETS, AlertsService, AppNotification, NOTIFICATION_ICONS, alertQuery } from '../../core/alerts.service';
import { MyBusiness } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
import { helpUrl } from '../../core/help';
import { LangService } from '../../core/lang.service';
import { ScreenService } from '../../core/screen.service';
import { ThemeModeService } from '../../core/theme-mode.service';
import { AccountMenu } from '../../shared/account-menu/account-menu';
import { LangButton } from '../../shared/lang-button/lang-button';

/**
 * Top bar (prototype appTopbar, PLAIN.md 8): business switcher, branch selector, today's rate, notifications,
 * language, dark mode, account. The branch selector is the only branch control in the app (PLAIN.md 11.11).
 */
@Component({
  selector: 'ms-app-topbar',
  imports: [DatePipe, 
    RouterLink, TranslatePipe, DecimalPipe, ButtonDirective, ButtonIcon, Menu, Popover, Ripple, Tooltip, LangButton,
    AccountMenu,
  ],
  templateUrl: './app-topbar.html',
  styleUrl: './app-topbar.scss',
})
export class AppTopbar {
  readonly menu = output<void>();

  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  protected readonly theme = inject(ThemeModeService);
  protected readonly alerts = inject(AlertsService);
  protected readonly targets = ALERT_TARGETS;
  protected readonly notificationIcons = NOTIFICATION_ICONS;
  protected readonly queryOf = alertQuery;
  private readonly screen = inject(ScreenService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  private readonly url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), {
    initialValue: this.router.url,
  });
  /** The website's guide for the page on screen, in the app's language. */
  protected readonly helpHref = computed(() => helpUrl(this.url(), this.lang.lang()));

  protected readonly businessName = computed(() => {
    const b = this.business.current();
    return b ? this.lang.name(b.nameEn, b.nameKm) : '';
  });
  /** My role in the open business, under its name. */
  protected readonly roleName = computed(() => {
    const b = this.business.current();
    if (!b) {
      return '';
    }
    // Built-in roles have their names in the translations; a business's own roles carry theirs.
    return ['OWNER', 'MANAGER', 'STOCK_KEEPER', 'CASHIER'].includes(b.roleCode)
      ? this.t('roles.' + b.roleCode)
      : this.lang.name(b.roleNameEn, b.roleNameKm);
  });
  protected readonly branchName = computed(() => {
    const b = this.business.branch();
    return b ? this.lang.name(b.nameEn, b.nameKm) : null;
  });

  /**
   * Business switcher: my businesses and "All my businesses", and on phones the branches. (In a PrimeNG menu with
   * groups, every top-level entry is a group heading, so links go inside a group.)
   */
  protected readonly businessItems = computed<MenuItem[]>(() => {
    const current = this.business.businessId();
    const items: MenuItem[] = [
      {
        label: this.t('shell.yourBusinesses'),
        items: [
          ...(this.business.businesses() ?? []).map((b, i) => ({
            label: this.lang.name(b.nameEn, b.nameKm),
            styleClass: b.id === current ? 'active' : undefined,
            command: () => this.switchTo(b),
            business: b,
            alt: i % 2 === 1,
          })),
          { separator: true },
          { label: this.t('shell.allMyBusinesses'), icon: 'pi pi-briefcase', command: () => this.router.navigate(['/businesses']) },
        ],
      },
    ];
    if (this.screen.phone() && this.business.canPickBranch() && this.business.pickableBranches().length > 1) {
      items.push({ separator: true }, { label: this.t('shell.branch'), items: this.branchEntries() });
    }
    return items;
  });

  /** Branch selector (the chip): all branches, then each branch. */
  protected readonly branchItems = computed<MenuItem[]>(() => [{ label: this.t('shell.branch'), items: this.branchEntries() }]);

  /** A notification opens the page that deals with it, and is read. */
  protected openNotification(n: AppNotification, popover: Popover): void {
    this.alerts.readNotification(n);
    popover.hide();
    if (n.link) {
      void this.router.navigateByUrl(n.link);
    }
  }

  /** Its text in the member's language: Khmer names where the notification carries them. */
  protected notificationParams(n: AppNotification): Record<string, unknown> {
    const km = this.lang.lang() === 'km';
    const p = { ...n.params };
    for (const key of ['product', 'warehouse', 'from']) {
      if (km && p[key + 'Km']) {
        p[key] = p[key + 'Km'];
      }
    }
    // A short cash shift: only the currency that is short ("$9.00", "៛4,000" or both)
    if (n.type === 'SHIFT_SHORT') {
      const usd = Number(p['usd'] ?? 0);
      const khr = Number(p['khr'] ?? 0);
      p['amounts'] = [usd > 0 ? '$' + usd.toFixed(2) : '', khr > 0 ? '៛' + Math.round(khr).toLocaleString('en-US') : ''].filter(Boolean).join(' · ');
    }
    return p;
  }

  /** Opens the alerts with fresh numbers. */
  protected openAlerts(event: Event, popover: Popover): void {
    this.alerts.refresh();
    popover.toggle(event);
  }

  protected initials(b: MyBusiness): string {
    return b.nameEn.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }

  /** Switching business reloads its branches and rate, then opens its dashboard (or setup page). */
  protected switchTo(b: MyBusiness): void {
    if (b.id === this.business.businessId()) {
      return;
    }
    this.business.open(b.id);
    if (!b.onboardingCompleted) {
      this.router.navigate(['/setup']);
      return;
    }
    this.business.loadContext().subscribe(() => this.router.navigate(['/dashboard']));
  }

  private branchEntries(): MenuItem[] {
    const selected = this.business.branchId();
    return [
      {
        label: this.t('shell.allBranches'),
        icon: 'pi pi-sitemap',
        styleClass: selected === null ? 'active' : undefined,
        command: () => this.business.selectBranch(null),
      },
      ...this.business.pickableBranches().map((b) => ({
        label: this.lang.name(b.nameEn, b.nameKm) + (b.main ? ` · ${this.t('shell.mainBranch')}` : '')
          + (b.readOnly ? ` · ${this.t('shell.readOnly')}` : ''),
        icon: b.readOnly ? 'pi pi-lock' : 'pi pi-shop',
        styleClass: b.id === selected ? 'active' : undefined,
        command: () => this.business.selectBranch(b.id),
      })),
    ];
  }

  /** Menu labels in the current language (reading lang() makes the menus follow a language switch). */
  private t(key: string): string {
    this.lang.lang();
    return this.translate.instant(key);
  }
}
