import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonDirective, ButtonIcon } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { Popover } from 'primeng/popover';
import { Ripple } from 'primeng/ripple';
import { Tooltip } from 'primeng/tooltip';

import { MyBusiness } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
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
  imports: [
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
  private readonly screen = inject(ScreenService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly businessName = computed(() => {
    const b = this.business.current();
    return b ? this.lang.name(b.nameEn, b.nameKm) : '';
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
    if (this.screen.phone() && this.business.canPickBranch() && this.business.branches().length > 1) {
      items.push({ separator: true }, { label: this.t('shell.branch'), items: this.branchEntries() });
    }
    return items;
  });

  /** Branch selector (the chip): all branches, then each branch. */
  protected readonly branchItems = computed<MenuItem[]>(() => [{ label: this.t('shell.branch'), items: this.branchEntries() }]);

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
      ...this.business.branches().map((b) => ({
        label: this.lang.name(b.nameEn, b.nameKm) + (b.main ? ` · ${this.t('shell.mainBranch')}` : ''),
        icon: 'pi pi-shop',
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
