import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../../core/api/api.service';
import { BusinessProfile } from '../../../core/api/models';
import { BusinessService, PALETTES } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { ThemeModeService, UiMode } from '../../../core/theme-mode.service';
import { FieldLabel } from '../../../shared/field-label/field-label';

/**
 * Appearance (prototype appearance.html): the business color, one of five tested palettes, for everyone in the
 * business; and my own light, dark or device mode, saved to my account.
 */
@Component({
  selector: 'ms-appearance-page',
  imports: [FormsModule, TranslatePipe, SelectButton, FieldLabel],
  templateUrl: './appearance-page.html',
  styleUrl: './appearance-page.scss',
})
export class AppearancePage {
  private readonly api = inject(ApiService);
  protected readonly business = inject(BusinessService);
  protected readonly theme = inject(ThemeModeService);
  private readonly notify = inject(NotifyService);

  /** The swatch color of each palette in light mode (from the prototype's palettes). */
  protected readonly palettes = PALETTES.map((name) => ({
    name,
    color: { blue: '#1a73e8', indigo: '#3f51b5', purple: '#6750a4', teal: '#00796b', green: '#188038' }[name] ?? '#1a73e8',
  }));
  protected readonly selected = computed(() => this.business.profile()?.themeColor || 'blue');
  protected readonly canManage = computed(() => this.business.can('business:manage'));
  protected readonly busy = signal(false);
  protected readonly modes = [
    { value: 'light', label: 'settings.appearance.light', icon: 'pi pi-sun' },
    { value: 'dark', label: 'settings.appearance.dark', icon: 'pi pi-moon' },
    { value: 'system', label: 'settings.appearance.system', icon: 'pi pi-desktop' },
  ];

  protected pick(color: string): void {
    const profile = this.business.profile();
    if (!profile || !this.canManage() || color === this.selected()) {
      return;
    }
    this.busy.set(true);
    // The profile is saved whole, with the new color.
    this.api.put<BusinessProfile>('/business', { ...profile, themeColor: color }).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.business.setProfile(saved);
        this.notify.showKey('settings.saved');
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected setMode(mode: UiMode): void {
    this.theme.set(mode);
  }
}
