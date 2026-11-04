/**
 * Excel and print for reports (FR-5.7), from what the report shows: its key figures, then each table as the reader sees
 * it. Money in a cell ("$1,234.50", "−$2.00") becomes a number in Excel, so it adds up there.
 */
export interface ReportMeta {
  /** The report's name. */
  title: string;
  /** Business, branch, period, printed on… */
  lines: string[];
}

type Cell = { value: string | number; type?: typeof Number | typeof String; format?: string; fontWeight?: 'bold' } | null;

const MONEY = /^([−-])?\$([−-])?([\d,]+(?:\.\d+)?)$/;
const RIEL = /^([−-])?៛([\d,]+)$/;
const PLAIN_NUMBER = /^-?[\d,]+(?:\.\d+)?$/;

/** Downloads the report as an .xlsx file. The Excel library loads only when someone exports. */
export async function exportReport(el: HTMLElement, meta: ReportMeta, fileName: string): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const rows: Cell[][] = [[{ value: meta.title, fontWeight: 'bold' }], ...meta.lines.map((l) => [{ value: l }] as Cell[]), [null]];

  const kpis = [...el.querySelectorAll<HTMLElement>('.kpi')];
  for (const k of kpis) {
    const label = text(k.querySelector('.kpi-label'));
    const value = text(k.querySelector('.kpi-value'));
    const sub = text(k.querySelector('.kpi-sub'));
    rows.push([{ value: label, fontWeight: 'bold' }, cell(value), sub ? { value: sub } : null]);
  }
  // Statement-like cards (profit and loss) are label and amount lines
  for (const line of el.querySelectorAll<HTMLElement>('.statement .line')) {
    const parts = [...line.children].map((c) => text(c));
    rows.push([{ value: parts[0] ?? '', fontWeight: line.classList.contains('total') ? 'bold' : undefined }, cell(parts[1] ?? '')]);
  }
  if (kpis.length) {
    rows.push([null]);
  }

  let widest = 1;
  for (const table of el.querySelectorAll<HTMLTableElement>('table')) {
    for (const tr of table.querySelectorAll<HTMLTableRowElement>('thead tr')) {
      const head = [...tr.cells].map((c) => ({ value: text(c), fontWeight: 'bold' as const }));
      widest = Math.max(widest, head.length);
      rows.push(head);
    }
    for (const tr of table.querySelectorAll<HTMLTableRowElement>('tbody tr, tfoot tr')) {
      if (tr.querySelector('.empty-cell')) {
        continue;
      }
      const values = [...tr.cells].map((c) => cell(text(c)));
      widest = Math.max(widest, values.length);
      rows.push(values);
    }
    rows.push([null]);
  }

  const columns = Array.from({ length: widest }, (_, i) => ({ width: i === 0 ? 34 : 16 }));
  const blob = await writeExcelFile(rows as never, { columns }).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Prints the report on its own: a copy goes on a sheet straight in the page body (the app's scrolling panels would
 * cut it), with a header; the sheet is removed after printing. Buttons and filters marked .no-print stay off paper.
 */
export function printReport(el: HTMLElement, meta: ReportMeta): void {
  const sheet = document.createElement('div');
  sheet.className = 'print-report';
  const head = document.createElement('header');
  head.className = 'print-report-head';
  const h1 = document.createElement('h1');
  h1.textContent = meta.title;
  head.append(h1, ...meta.lines.map((l) => Object.assign(document.createElement('p'), { textContent: l })));
  const body = el.cloneNode(true) as HTMLElement;
  body.querySelectorAll('.no-print').forEach((n) => n.remove());
  sheet.append(head, body);
  document.body.append(sheet);
  const done = () => sheet.remove();
  window.addEventListener('afterprint', done, { once: true });
  window.print();
  setTimeout(done, 60_000); // in case afterprint never comes
}

function text(node: Element | null): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function cell(value: string): Cell {
  if (!value) {
    return null;
  }
  const money = MONEY.exec(value);
  if (money) {
    const n = Number(money[3].replace(/,/g, ''));
    return { value: money[1] || money[2] ? -n : n, type: Number, format: '$#,##0.00' };
  }
  const riel = RIEL.exec(value);
  if (riel) {
    const n = Number(riel[2].replace(/,/g, ''));
    return { value: riel[1] ? -n : n, type: Number, format: '#,##0 "៛"' };
  }
  if (PLAIN_NUMBER.test(value)) {
    return { value: Number(value.replace(/,/g, '')), type: Number };
  }
  return { value };
}
