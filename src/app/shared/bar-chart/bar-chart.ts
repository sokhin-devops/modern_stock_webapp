import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/** One bar: its short label under the axis, its value, and the text shown when it is pointed at. */
export interface BarPoint {
  key: string;
  label: string;
  value: number;
  tip: string;
}

/**
 * A single-series bar chart (sales by day, by product...): thin bars in the brand color with rounded tops, a recessive
 * grid with the top value, and a tooltip on hover. The same numbers are in a hidden table for screen readers; reports
 * also show them in their own table.
 */
@Component({
  selector: 'ms-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bar-chart.html',
  styleUrl: './bar-chart.scss',
})
export class BarChart {
  readonly points = input.required<BarPoint[]>();
  /** What the chart shows, for screen readers ("Sales by day"). */
  readonly label = input.required<string>();
  /** Formats the top value of the grid. */
  readonly format = input<(value: number) => string>((v) => String(v));
  readonly height = input(200);

  protected readonly active = signal<number | null>(null);

  protected readonly max = computed(() => Math.max(0, ...this.points().map((p) => p.value)));
  /** Every nth label under the axis, so labels never touch (about 8 at most). */
  protected readonly every = computed(() => Math.max(1, Math.ceil(this.points().length / 8)));

  protected heightOf(value: number): number {
    const max = this.max();
    return max > 0 && value > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  }
}
