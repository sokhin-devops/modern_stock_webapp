import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { MyBusiness } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
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
    RouterLink, TranslatePipe, DecimalPipe, MatIcon, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger, MatDivider,
    MatTooltip, LangButton, AccountMenu,
  ],
  templateUrl: './app-topbar.html',
  styleUrl: './app-topbar.scss',
})
export class AppTopbar {
  readonly menu = output<void>();

  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  protected readonly theme = inject(ThemeModeService);
  private readonly router = inject(Router);

  protected readonly businessName = computed(() => {
    const b = this.business.current();
    return b ? this.lang.name(b.nameEn, b.nameKm) : '';
  });
  protected readonly branchName = computed(() => {
    const b = this.business.branch();
    return b ? this.lang.name(b.nameEn, b.nameKm) : null;
  });

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
}
