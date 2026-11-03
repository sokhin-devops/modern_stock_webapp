import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';

import { LangService } from '../../core/lang.service';
import { Flag } from '../flag/flag';

/** Round button with the flag of the current language; one click switches (PLAIN.md 4). */
@Component({
  selector: 'ms-lang-button',
  imports: [ButtonDirective, ButtonIcon, Tooltip, TranslatePipe, Flag],
  templateUrl: './lang-button.html',
  styleUrl: './lang-button.scss',
})
export class LangButton {
  protected readonly lang = inject(LangService);
}
