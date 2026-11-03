import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppSidebar } from '../app-sidebar/app-sidebar';
import { AppTopbar } from '../app-topbar/app-topbar';

const COLLAPSED_KEY = 'ms-collapsed';

/**
 * The business shell (prototype buildShell): top bar, side menu, and the page. The shell fills the screen and never
 * scrolls; only the page body does. The side menu collapses to icons (remembered), and slides in on phones.
 */
@Component({
  selector: 'ms-app-shell',
  imports: [RouterOutlet, AppTopbar, AppSidebar],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  protected readonly collapsed = signal(readCollapsed());
  protected readonly navOpen = signal(false);

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
