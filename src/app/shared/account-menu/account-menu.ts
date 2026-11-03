import { Component, computed, inject } from '@angular/core';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { LangService } from '../../core/lang.service';
import { ThemeModeService } from '../../core/theme-mode.service';

/** The avatar in the top bar and its menu (prototype accountMenu): my businesses, website, language, dark mode, log out. */
@Component({
  selector: 'ms-account-menu',
  imports: [RouterLink, TranslatePipe, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatDivider],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.scss',
})
export class AccountMenu {
  protected readonly auth = inject(AuthService);
  protected readonly lang = inject(LangService);
  protected readonly theme = inject(ThemeModeService);
  protected readonly websiteUrl = environment.websiteUrl;

  protected readonly initial = computed(() => (this.auth.user()?.fullName.trim()[0] ?? '?').toUpperCase());
  protected readonly login = computed(() => this.auth.user()?.email ?? this.auth.user()?.username ?? '');
}
