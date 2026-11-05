/** One table of the business, as GET /business/export gives it. */
export interface ExportSheet {
  key: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

export interface ExportData {
  businessName: string;
  exportedAt: string;
  sheets: ExportSheet[];
}

type Cell = { value: string | number | Date; type?: typeof Number | typeof String | typeof Date; format?: string; fontWeight?: 'bold' } | null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/**
 * Writes the export (FR-7.12) as one Excel file, a sheet per table with translated headers: dates as Excel dates,
 * yes/no in words, statuses as the app names them. The Excel library loads only when someone exports.
 */
export async function downloadExport(data: ExportData, t: (key: string) => string, fileName: string): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const label = (key: string, fallback: string) => {
    const text = t(key);
    return text === key ? fallback : text;
  };
  const sheets = data.sheets.map((s) => {
    const head: Cell[] = s.columns.map((c) => ({ value: label(`export.cols.${c}`, c), fontWeight: 'bold' }));
    const body: Cell[][] = s.rows.map((row) => row.map((v, i) => cell(v, s.columns[i], t)));
    return {
      // Excel sheet names: up to 31 characters, without : \ / ? * [ ]
      sheet: label(`export.sheets.${s.key}`, s.key).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31),
      data: [head, ...body],
      columns: s.columns.map((c) => ({ width: /^(name|nameEn|nameKm|product|customer|supplier|party|note|reason|address)$/.test(c) ? 30 : 15 })),
      stickyRowsCount: 1,
    };
  });
  const blob = await writeExcelFile(sheets as never).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cell(v: string | number | boolean | null, column: string, t: (key: string) => string): Cell {
  if (v == null || v === '') {
    return null;
  }
  if (typeof v === 'boolean') {
    return { value: t(v ? 'common.yes' : 'common.no') };
  }
  if (typeof v === 'number') {
    return { value: v, type: Number };
  }
  if (DATE.test(v)) {
    return { value: new Date(`${v}T00:00:00Z`), type: Date, format: 'dd/mm/yyyy' };
  }
  if (DATE_TIME.test(v)) {
    return { value: new Date(`${v.replace(' ', 'T')}:00Z`), type: Date, format: 'dd/mm/yyyy hh:mm' };
  }
  if (column === 'status') {
    const key = `docs.status.${v}`;
    const text = t(key);
    return { value: text === key ? v : text };
  }
  return { value: v };
}
