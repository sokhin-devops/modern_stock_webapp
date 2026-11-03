import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Lang } from '../../core/api/models';

/** Round flag of the current language (Cambodia for Khmer, United Kingdom for English), as in the prototype. */
@Component({
  selector: 'ms-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flag' },
  templateUrl: './flag.html',
  styleUrl: './flag.scss',
})
export class Flag {
  readonly lang = input.required<Lang>();
}
