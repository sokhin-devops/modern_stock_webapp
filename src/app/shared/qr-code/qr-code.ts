import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * A QR code of a text (an invitation link), drawn as SVG so it stays sharp on screen and on paper (FR-6.12). The
 * qrcode library loads only when a code is shown. The value is also the accessible name.
 */
@Component({
  selector: 'ms-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label() || value()' },
  template: `<div class="qr" [innerHTML]="svg()"></div>`,
  styleUrl: './qr-code.scss',
})
export class QrCode {
  readonly value = input.required<string>();
  /** What the code is, for screen readers ("Invitation link"). */
  readonly label = input('');

  private readonly sanitizer = inject(DomSanitizer);
  protected readonly svg = signal<SafeHtml | null>(null);

  constructor() {
    effect(() => {
      const value = this.value();
      import('qrcode').then(({ toString }) =>
        toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }),
      ).then((svg) => this.svg.set(this.sanitizer.bypassSecurityTrustHtml(svg))); // our own SVG from the library
    });
  }
}
