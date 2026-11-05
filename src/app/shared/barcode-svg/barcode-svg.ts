import { Component, ElementRef, effect, input, viewChild } from '@angular/core';

/** jsbarcode, loaded once on first use (labels are printed now and then, so it stays out of the main bundle). */
const load = () => import('jsbarcode');
let library: ReturnType<typeof load> | null = null;

/**
 * One barcode drawn as SVG (FR-1.9): EAN-13 when the code is 13 digits (shop products and in-store 20… codes), Code 128
 * for anything else. The digits are printed under the bars.
 */
@Component({
  selector: 'ms-barcode-svg',
  template: '<svg #svg role="img" [attr.aria-label]="code()"></svg>',
  styles: ':host { display: block; } svg { display: block; width: 100%; height: 100%; }',
})
export class BarcodeSvg {
  readonly code = input.required<string>();
  /** Bar height in px before scaling. */
  readonly height = input(40);

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  constructor() {
    effect(() => {
      const code = this.code();
      const height = this.height();
      const svg = this.svg().nativeElement;
      library ??= load();
      library.then((m) => {
        const draw = m.default;
        const options = { height, width: 2, margin: 0, fontSize: 16, textMargin: 2, background: 'transparent' };
        try {
          draw(svg, code, { ...options, format: /^\d{13}$/.test(code) ? 'EAN13' : 'CODE128' });
        } catch {
          // A 13-digit code whose check digit is wrong is not an EAN-13: print it as Code 128
          draw(svg, code, { ...options, format: 'CODE128' });
        }
        // Drawn at a fixed size: scale it to whatever room the host gives instead
        const w = parseFloat(svg.getAttribute('width') ?? '');
        const h = parseFloat(svg.getAttribute('height') ?? '');
        if (w && h) {
          svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
        }
      });
    });
  }
}
