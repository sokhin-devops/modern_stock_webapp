import { Component, inject, signal } from '@angular/core';
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
  /** Set by the first switch, so the flag turns when the language changes but not when the page opens. */
  protected readonly turned = signal(false);

  protected switch(): void {
    this.turned.set(true);
    this.lang.toggle();
  }
}
