import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ScreenService } from '../../core/screen.service';
import { AppSidebar } from '../app-sidebar/app-sidebar';
import { AppTopbar } from '../app-topbar/app-topbar';
import { PlanBanner } from '../plan-banner/plan-banner';

const COLLAPSED_KEY = 'ms-collapsed';

/**
 * The business shell (prototype buildShell): top bar, side menu, and the page. The shell fills the screen and never
 * scrolls; only the page body does. The side menu collapses to icons (remembered), is always icons on tablets,
 * and slides in on phones (full width, whatever the setting).
 */
@Component({
  selector: 'ms-app-shell',
  imports: [RouterOutlet, AppTopbar, AppSidebar, PlanBanner],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  protected readonly collapsed = signal(readCollapsed());
  protected readonly navOpen = signal(false);

  private readonly screen = inject(ScreenService);
  /** The side menu shows icons only: collapsed by hand, or a tablet. Phones always get the full menu. */
  protected readonly rail = computed(() => !this.screen.phone() && (this.collapsed() || this.screen.tablet()));

  protected toggleCollapsed(): void {
    const value = !this.collapsed();
    this.collapsed.set(value);
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      // storage blocked: remembered for this visit only
    }
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
