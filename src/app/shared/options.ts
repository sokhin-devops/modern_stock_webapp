import { Branch } from '../core/api/models';
import { LangService } from '../core/lang.service';

export interface Option<T = number> {
  value: T;
  label: string;
}

/**
 * Active warehouses as select options ("Toul Kork · Back store"), for one branch or, with null, every branch.
 * With a single branch the branch name is left out.
 */
export function warehouseOptions(branches: Branch[], lang: LangService, branchId: number | null): Option[] {
  const list = branches.filter((b) => b.active && (branchId == null || b.id === branchId));
  return list.flatMap((b) =>
    b.warehouses
      .filter((w) => w.active)
      .map((w) => ({
        value: w.id,
        label: list.length > 1 ? `${lang.name(b.nameEn, b.nameKm)} · ${lang.name(w.nameEn, w.nameKm)}` : lang.name(w.nameEn, w.nameKm),
      })),
  );
}

/** The warehouse a branch receives goods in (or its first one). */
export function receivingWarehouse(branches: Branch[], branchId: number | null): number | null {
  const branch = branches.find((b) => b.id === branchId) ?? branches.find((b) => b.main);
  return branch?.warehouses.find((w) => w.active && w.receiving)?.id ?? branch?.warehouses.find((w) => w.active)?.id ?? null;
}

/** Document lines in the shape the API takes (productId, unitId, qty...); empty lines are left out. */
export function filledLines<T extends { product: unknown; qty: number | null }>(lines: T[]): T[] {
  return lines.filter((l) => l.product && l.qty);
}
