import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** An open dropdown, date picker or menu closes itself on Escape first, as before. */
const OPEN_OVERLAYS = '.p-select-overlay, .p-autocomplete-overlay, .p-multiselect-overlay, .p-datepicker-panel, .p-popover, .p-menu-overlay, .p-tieredmenu-overlay';

/**
 * Escape closes the top dialog only. Each PrimeNG 19 dialog closes on any Escape, so with one dialog over another (a
 * print preview over a purchase order, a confirmation over an adjustment) one key closed them all. With two or more
 * open, this takes the key first and closes the top one with its close button, or the "No" of a confirmation.
 */
@Injectable({ providedIn: 'root' })
export class DialogEscape {
  private readonly document = inject(DOCUMENT);

  /** Call once, from the root component. */
  start(): void {
    this.document.addEventListener('keydown', (event) => this.onKey(event), true);
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.document.querySelector(OPEN_OVERLAYS)) {
      return;
    }
    const open = [...this.document.querySelectorAll<HTMLElement>('.p-dialog')].filter((d) => d.offsetParent !== null);
    if (open.length < 2) {
      return;
    }
    const top = open.reduce((a, b) => (zIndex(b) >= zIndex(a) ? b : a));
    event.stopImmediatePropagation();
    event.preventDefault();
    (top.querySelector<HTMLElement>('.p-dialog-close-button') ?? top.querySelector<HTMLElement>('.p-confirmdialog-reject-button'))?.click();
  }
}

function zIndex(dialog: HTMLElement): number {
  return Number(getComputedStyle(dialog.closest('.p-dialog-mask') ?? dialog).zIndex) || 0;
}
