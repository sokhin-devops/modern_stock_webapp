import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Lang } from '../../core/api/models';

let nextId = 0;

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
  /** Every flag on the page needs its own clip path id. */
  protected readonly clipId = `flag-clip-${nextId++}`;
}
