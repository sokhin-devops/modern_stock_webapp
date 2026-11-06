import { firstValueFrom, Observable } from 'rxjs';

import { PageResponse } from '../core/api/models';

/** One column of an exported list: its header (already translated) and the value of a row. */
export interface ListColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Excel number format for numbers, for example "#,##0.00". */
  format?: string;
}

const PAGE = 200;
/** A list bigger than this is cut; Excel opens it, but nobody reads it. */
const MAX_ROWS = 20000;

/**
 * Export on the right of every list (PLAIN.md 12.2 screen patterns): every row matching the list's search and filters,
 * not only the page on screen, as an .xlsx file. The Excel library loads only when someone exports.
 */
export async function exportList<T>(
  fetch: (page: number, size: number) => Observable<PageResponse<T>>,
  columns: ListColumn<T>[],
  fileName: string,
): Promise<void> {
  const rows: T[] = [];
  for (let page = 0; rows.length < MAX_ROWS; page++) {
    const p = await firstValueFrom(fetch(page, PAGE));
    rows.push(...p.content);
    if (p.content.length < PAGE || rows.length >= p.totalElements) {
      break;
    }
  }
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  type Cell = { value: string | number; type?: typeof Number | typeof String; format?: string; fontWeight?: 'bold' } | null;
  const head: Cell[] = columns.map((c) => ({ value: c.header, fontWeight: 'bold' }));
  const body: Cell[][] = rows.map((r) =>
    columns.map((c) => {
      const v = c.value(r);
      if (v === null || v === undefined || v === '') {
        return null;
      }
      return typeof v === 'number' ? { value: v, type: Number, format: c.format ?? '#,##0.##' } : { value: String(v), type: String };
    }),
  );
  const widths = columns.map((c, i) =>
    Math.min(48, Math.max(c.header.length, ...body.slice(0, 500).map((r) => String(r[i]?.value ?? '').length)) + 2),
  );
  const blob = await writeExcelFile([head, ...body] as never, { columns: widths.map((width) => ({ width })) }).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
