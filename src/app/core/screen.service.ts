import { BreakpointObserver } from '@angular/cdk/layout';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/** The prototype's breakpoints (src/styles/_prototype.scss). */
const PHONE = '(max-width: 768px)';
const TABLET = '(min-width: 769px) and (max-width: 1100px)';

/** Screen size for the few things CSS alone can't decide (which menu entries to show, how the side menu behaves). */
@Injectable({ providedIn: 'root' })
export class ScreenService {
  private readonly observer = inject(BreakpointObserver);

  /** Phones: the side menu slides in and the top bar keeps only the essentials. */
  readonly phone = this.watch(PHONE);
  /** Tablets: the side menu is always a rail of icons. */
  readonly tablet = this.watch(TABLET);

  private watch(query: string) {
    return toSignal(this.observer.observe(query).pipe(map((state) => state.matches)), {
      initialValue: this.observer.isMatched(query),
    });
  }
}
