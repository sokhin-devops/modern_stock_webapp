import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { LangService } from '../../core/lang.service';
import { ThemeModeService } from '../../core/theme-mode.service';

/** The avatar in the top bar and its menu (prototype accountMenu): my businesses, website, language, dark mode, log out. */
@Component({
  selector: 'ms-account-menu',
  imports: [TranslatePipe, Menu],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.scss',
})
export class AccountMenu {
  protected readonly auth = inject(AuthService);
  private readonly lang = inject(LangService);
  private readonly theme = inject(ThemeModeService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly initial = computed(() => (this.auth.user()?.fullName.trim()[0] ?? '?').toUpperCase());
  protected readonly login = computed(() => this.auth.user()?.email ?? this.auth.user()?.username ?? '');

  protected readonly items = computed<MenuItem[]>(() => {
    const lang = this.lang.lang(); // labels follow a language switch
    const dark = this.theme.dark();
    const t = (key: string) => this.translate.instant(key);
    return [
      { separator: true },
      { label: t('account.myBusinesses'), icon: 'pi pi-briefcase', command: () => this.router.navigate(['/businesses']) },
      { label: t('account.website'), icon: 'pi pi-globe', url: `${environment.websiteUrl}/${lang}`, target: '_blank' },
      { separator: true },
      {
        label: `${t('common.language')}: ${t('common.switchLanguage')}`,
        icon: 'pi pi-language',
        command: () => this.lang.toggle(),
      },
      {
        label: t(dark ? 'common.lightMode' : 'common.darkMode'),
        icon: dark ? 'pi pi-sun' : 'pi pi-moon',
        command: () => this.theme.toggle(),
      },
      { separator: true },
      { label: t('account.logout'), icon: 'pi pi-sign-out', command: () => this.auth.logout() },
    ];
  });
}
