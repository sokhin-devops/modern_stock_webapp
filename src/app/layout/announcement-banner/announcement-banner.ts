import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon } from 'primeng/button';

import { LangService } from '../../core/lang.service';
import { PlatformService } from '../../core/platform.service';

/**
 * The super admin's announcement (FR-8.10), e.g. planned maintenance, over every page of the app until it is closed
 * (for this tab) or taken down.
 */
@Component({
  selector: 'ms-announcement-banner',
  imports: [TranslatePipe, ButtonDirective, ButtonIcon],
  template: `
    @if (platform.announcement(); as a) {
      <div class="banner" [class.banner-warn]="a.level === 'WARN'" [class.banner-primary]="a.level !== 'WARN'" role="status">
        <i class="icon pi" [class.pi-exclamation-triangle]="a.level === 'WARN'" [class.pi-megaphone]="a.level !== 'WARN'"></i>
        <div class="text">{{ lang.lang() === 'km' ? a.km : a.en }}</div>
        <button pButton type="button" [rounded]="true" [text]="true" severity="secondary" size="small" (click)="platform.dismiss()"
                [attr.aria-label]="'common.close' | translate">
          <i class="pi pi-times" pButtonIcon></i>
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    // Above the page, as wide as it, like the plan banner.
    .banner {
      flex: none;
      margin: 0 0 12px;
      padding-block: 4px;
    }
  `,
})
export class AnnouncementBanner {
  protected readonly platform = inject(PlatformService);
  protected readonly lang = inject(LangService);

  constructor() {
    this.platform.load();
  }
}
