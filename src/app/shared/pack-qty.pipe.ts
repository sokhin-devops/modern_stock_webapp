import { Pipe, PipeTransform } from '@angular/core';

import { Pack } from '../core/api/models';

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/**
 * A base-unit quantity as packs and pieces, the way shops count stock (FR-4.5): 53 pcs with 1 box = 24 pcs →
 * "2 box + 5 pcs". Without a pack, or under one pack, just "5 pcs".
 *
 *   {{ row.qty | packQty: row.pack : row.unitSymbol }}
 */
@Pipe({ name: 'packQty' })
export class PackQtyPipe implements PipeTransform {
  transform(qty: number | null | undefined, pack: Pack | null | undefined, unit: string): string {
    if (qty == null) {
      return '';
    }
    const sign = qty < 0 ? '−' : '';
    const abs = Math.abs(qty);
    if (!pack || pack.factor <= 1 || abs < pack.factor) {
      return `${sign}${NUMBER.format(abs)} ${unit}`;
    }
    const packs = Math.floor(abs / pack.factor);
    const rest = +(abs - packs * pack.factor).toFixed(3);
    return rest > 0
      ? `${sign}${NUMBER.format(packs)} ${pack.symbol} + ${NUMBER.format(rest)} ${unit}`
      : `${sign}${NUMBER.format(packs)} ${pack.symbol}`;
  }
}
