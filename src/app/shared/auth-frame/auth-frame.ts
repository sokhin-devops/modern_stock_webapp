import { Component, inject, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { LangService } from '../../core/lang.service';
import { ThemeModeService } from '../../core/theme-mode.service';
import { LangButton } from '../lang-button/lang-button';

/**
 * The prototype's sign-in card (sign-in.html): logo, title and line on the left, the form on the right,
 * with the language and dark-mode buttons under it. Login, sign-up, password and invitation pages use it.
 */
@Component({
  selector: 'ms-auth-frame',
  imports: [MatIcon, MatIconButton, TranslatePipe, LangButton],
  templateUrl: './auth-frame.html',
  styleUrl: './auth-frame.scss',
})
export class AuthFrame {
  readonly title = input.required<string>();
  readonly sub = input<string>('ModernStock');

  protected readonly theme = inject(ThemeModeService);
  protected readonly lang = inject(LangService);
  protected readonly websiteUrl = environment.websiteUrl;
}
