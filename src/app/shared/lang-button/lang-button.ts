import { Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';

import { LangService } from '../../core/lang.service';
import { Flag } from '../flag/flag';

/** Round button with the flag of the current language; one click switches (PLAIN.md 4). */
@Component({
  selector: 'ms-lang-button',
  imports: [MatIconButton, MatTooltip, TranslatePipe, Flag],
  templateUrl: './lang-button.html',
  styleUrl: './lang-button.scss',
})
export class LangButton {
  protected readonly lang = inject(LangService);
}
