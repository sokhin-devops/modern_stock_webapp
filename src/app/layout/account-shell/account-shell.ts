import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon } from 'primeng/button';

import { ThemeModeService } from '../../core/theme-mode.service';
import { AccountMenu } from '../../shared/account-menu/account-menu';
import { AnnouncementBanner } from '../announcement-banner/announcement-banner';
import { LangButton } from '../../shared/lang-button/lang-button';

/** Account pages (My businesses, setup): the prototype's top bar without the side menu. */
@Component({
  selector: 'ms-account-shell',
  imports: [RouterOutlet, RouterLink, TranslatePipe, ButtonDirective, ButtonIcon, LangButton, AccountMenu, AnnouncementBanner],
  templateUrl: './account-shell.html',
  styleUrl: './account-shell.scss',
})
export class AccountShell {
  protected readonly theme = inject(ThemeModeService);
}
