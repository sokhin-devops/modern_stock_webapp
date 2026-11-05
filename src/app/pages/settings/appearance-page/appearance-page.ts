import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../../core/api/api.service';
import { BusinessProfile } from '../../../core/api/models';
import { BusinessService, PALETTES } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';
import { ThemeModeService, UiDensity, UiMode } from '../../../core/theme-mode.service';
import { fitColor, isHexColor } from '../../../shared/colors';
import { FieldLabel } from '../../../shared/field-label/field-label';

/**
 * Appearance (prototype appearance.html): the business color for everyone in the business, one of five tested palettes
 * or an own color (FR-6.26, made readable and checked like the API does); and my own light, dark or device mode and
 * row density, saved to my account.
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
  /** The own color in use, if any. */
  protected readonly custom = computed(() => (isHexColor(this.selected()) ? this.selected() : null));
  /** Why the color just picked cannot be used. */
  protected readonly problem = signal<string | null>(null);
  protected readonly canManage = computed(() => this.business.can('business:manage'));
  protected readonly busy = signal(false);
  protected readonly modes = [
    { value: 'light', label: 'settings.appearance.light', icon: 'pi pi-sun' },
    { value: 'dark', label: 'settings.appearance.dark', icon: 'pi pi-moon' },
    { value: 'system', label: 'settings.appearance.system', icon: 'pi pi-desktop' },
  ];

  protected pick(color: string, done = 'settings.saved'): void {
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
        this.notify.showKey(done);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected readonly densities = [
    { value: 'comfortable', label: 'settings.appearance.comfortable', icon: 'pi pi-bars' },
    { value: 'compact', label: 'settings.appearance.compact', icon: 'pi pi-align-justify' },
  ];

  /** An own color from the picker: refused, or made dark enough for white text, then saved. */
  protected pickCustom(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const fitted = fitColor(value);
    if ('problem' in fitted) {
      this.problem.set(`settings.appearance.problem.${fitted.problem}`);
      return;
    }
    this.problem.set(null);
    this.pick(fitted.color, fitted.darkened ? 'settings.appearance.darkened' : 'settings.saved');
  }

  protected setDensity(density: UiDensity): void {
    this.theme.setDensity(density);
  }

  protected setMode(mode: UiMode): void {
    this.theme.set(mode);
  }
}
