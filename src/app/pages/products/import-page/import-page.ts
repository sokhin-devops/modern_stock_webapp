import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { receivingWarehouse, warehouseOptions } from '../../../shared/options';

type Kind = 'products' | 'stock';

interface RowResult {
  row: number;
  ok: boolean;
  errors: string[];
  notes: string[];
  label: string | null;
}

interface ImportResult {
  total: number;
  valid: number;
  imported: number;
  document: string | null;
  rows: RowResult[];
}

/** The template's columns; a file may have them in any order (matched by the header row). */
const COLUMNS: Record<Kind, string[]> = {
  products: ['nameEn', 'nameKm', 'sku', 'barcode', 'category', 'unit', 'sellPrice', 'reorderLevel', 'leadTimeDays',
    'trackExpiry', 'packUnit', 'packFactor', 'packBarcode', 'packPrice'],
  stock: ['sku', 'barcode', 'qty', 'unit', 'unitCost', 'batchNo', 'expiryDate'],
};

const EXAMPLES: Record<Kind, string[][]> = {
  products: [
    ['Drinking water 500ml', 'ទឹកសុទ្ធ 500ml', '', '8850001000017', 'Drinks', 'pcs', '0.50', '24', '3', 'no', 'box', '24', '8850001000024', '11.00'],
    ['Paracetamol 500mg', 'ប៉ារ៉ាសេតាមុល', '', '', 'Medicine', 'pack', '0.80', '10', '7', 'yes', '', '', '', ''],
  ],
  stock: [
    ['P00001', '', '48', 'pcs', '0.30', '', ''],
    ['', '8850001000024', '2', 'box', '7.20', 'LOT-0425', '2027-04-30'],
  ],
};

/**
 * Import from Excel or CSV (prototype import.html, FR-1.8): products (with category, unit, price, barcode and a pack
 * size) or opening stock of a warehouse (with batch and expiry). Download the template, choose the file, see every
 * row's problems before anything is saved, then import the rows that are ready.
 */
@Component({
  selector: 'ms-import-page',
  imports: [
    FormsModule, TranslatePipe, TableModule, Select, SelectButton, ToggleSwitch, ProgressBar, ButtonDirective, ButtonIcon,
    ButtonLabel, FieldLabel,
  ],
  templateUrl: './import-page.html',
  styleUrl: './import-page.scss',
})
export class ImportPage {
  private readonly api = inject(ApiService);
  protected readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly kinds = computed(() =>
    [
      { value: 'products' as Kind, label: 'import.kindProducts', allowed: this.business.can('product:manage') },
      { value: 'stock' as Kind, label: 'import.kindStock', allowed: this.business.can('stock:opening') },
    ].filter((k) => k.allowed),
  );
  protected readonly kind = signal<Kind>(this.business.can('product:manage') ? 'products' : 'stock');
  protected readonly warehouseId = signal<number | null>(receivingWarehouse(this.business.branches(), this.business.branchId()));
  protected readonly warehouses = computed(() => warehouseOptions(this.business.branches(), this.lang, null));

  protected readonly fileName = signal<string | null>(null);
  /** The file's rows as text cells keyed by column, with their row number in the file. */
  private readonly rows = signal<Record<string, string | number>[]>([]);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly busy = signal<'check' | 'import' | null>(null);
  protected readonly done = signal<ImportResult | null>(null);
  protected readonly onlyProblems = signal(false);

  protected readonly shown = computed(() => {
    const rows = this.result()?.rows ?? [];
    return this.onlyProblems() ? rows.filter((r) => !r.ok) : rows;
  });
  protected readonly problems = computed(() => (this.result()?.rows ?? []).filter((r) => !r.ok).length);

  protected setKind(kind: Kind): void {
    this.kind.set(kind);
    this.reset();
  }

  protected setWarehouse(id: number): void {
    this.warehouseId.set(id);
    if (this.rows().length) {
      this.check();
    }
  }

  /** A CSV with the header row and examples, which Excel opens as a sheet. */
  protected downloadTemplate(): void {
    const kind = this.kind();
    const lines = [COLUMNS[kind], ...EXAMPLES[kind]].map((cells) => cells.map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'products' ? 'modernstock-products.csv' : 'modernstock-opening-stock.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const table = file.name.toLowerCase().endsWith('.csv') ? parseCsv(await file.text()) : await readExcel(file);
      const rows = toRows(table, COLUMNS[this.kind()]);
      if (!rows.length) {
        this.notify.showKey('import.empty');
        return;
      }
      this.fileName.set(file.name);
      this.rows.set(rows);
      this.done.set(null);
      this.check();
    } catch {
      this.notify.showKey('import.badFile');
    }
  }

  /** Checks every row on the server (nothing is saved yet). */
  protected check(): void {
    this.send(true);
  }

  protected run(): void {
    this.send(false);
  }

  protected reset(): void {
    this.rows.set([]);
    this.result.set(null);
    this.done.set(null);
    this.fileName.set(null);
    this.onlyProblems.set(false);
  }

  private send(dryRun: boolean): void {
    const stock = this.kind() === 'stock';
    if (stock && !this.warehouseId()) {
      return;
    }
    this.busy.set(dryRun ? 'check' : 'import');
    const body = stock ? { warehouseId: this.warehouseId(), rows: this.rows() } : { rows: this.rows() };
    this.api.post<ImportResult>(`/import/${stock ? 'opening-stock' : 'products'}?dryRun=${dryRun}`, body).subscribe({
      next: (r) => {
        this.busy.set(null);
        this.result.set(r);
        if (!dryRun) {
          this.done.set(r);
          this.rows.set([]);
        }
      },
      error: (e) => {
        this.busy.set(null);
        this.notify.error(e);
      },
    });
  }
}

async function readExcel(file: File): Promise<unknown[][]> {
  const { readSheet } = await import('read-excel-file/browser');
  return (await readSheet(file)) as unknown[][];
}

/** A simple CSV reader: commas, quoted fields with "" inside, one row per line. */
function parseCsv(text: string): string[][] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const cells: string[] = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted && ch === '"' && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          quoted = !quoted;
        } else if (ch === ',' && !quoted) {
          cells.push(cell);
          cell = '';
        } else {
          cell += ch;
        }
      }
      cells.push(cell);
      return cells;
    });
}

/**
 * Rows after the header as {column: text}, matched by the header's names (any order, any case). Excel dates become
 * 2026-12-31; empty rows are left out. Each row keeps its number in the file, for the messages.
 */
function toRows(table: unknown[][], columns: string[]): Record<string, string | number>[] {
  const header = (table[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase());
  const index = new Map(columns.map((c) => [c, header.indexOf(c.toLowerCase())]));
  return table
    .slice(1)
    .map((cells, i) => {
      const row: Record<string, string | number> = { row: i + 2 };
      for (const [column, at] of index) {
        row[column] = at < 0 ? '' : cellText(cells[at]);
      }
      return row;
    })
    .filter((row) => columns.some((c) => row[c] !== ''));
}

function cellText(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return String(value).trim();
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
