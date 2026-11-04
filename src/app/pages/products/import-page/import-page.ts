import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { firstValueFrom } from 'rxjs';

import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';

/** One product read from the file, and what happened when it was added. */
interface ImportRow {
  row: number;
  nameEn: string;
  nameKm: string;
  sku: string;
  barcode: string;
  sellPrice: number;
  reorderLevel: number | null;
  result?: 'ok' | string;
}

const HEADER = ['nameEn', 'nameKm', 'sku', 'barcode', 'sellPrice', 'reorderLevel'];

/**
 * Import products from Excel or CSV (prototype import.html): download the template, choose a file, check the rows,
 * pick the stock unit, and add them one by one through the product API. Each row shows whether it was added.
 */
@Component({
  selector: 'ms-import-page',
  imports: [FormsModule, TranslatePipe, CurrencyPipe, TableModule, Select, ProgressBar, ButtonDirective, ButtonIcon, ButtonLabel, FieldLabel],
  templateUrl: './import-page.html',
  styleUrl: './import-page.scss',
})
export class ImportPage {
  private readonly catalog = inject(CatalogService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly rows = signal<ImportRow[]>([]);
  protected readonly unitId = signal<number | null>(null);
  protected readonly running = signal(false);
  protected readonly done = signal(0);
  protected readonly unitOptions = computed(() =>
    this.catalog.units().map((u) => ({ value: u.id, label: `${this.lang.name(u.nameEn, u.nameKm)} (${u.symbol})` })),
  );
  protected readonly ok = computed(() => this.rows().filter((r) => r.result === 'ok').length);
  protected readonly failed = computed(() => this.rows().filter((r) => r.result && r.result !== 'ok').length);

  constructor() {
    this.catalog.loadLists();
  }

  /** A CSV with the header row and one example, which Excel opens as a sheet. */
  protected downloadTemplate(): void {
    const csv = `${HEADER.join(',')}\nDrinking water 500ml,ទឹកសុទ្ធ 500ml,,8850001000017,0.50,24\n`;
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modernstock-products.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  protected async choose(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    try {
      const table = file.name.toLowerCase().endsWith('.csv') ? parseCsv(await file.text()) : await readExcel(file);
      this.rows.set(toRows(table));
      if (!this.unitId()) {
        this.unitId.set(this.catalog.units().find((u) => u.symbol === 'pcs')?.id ?? this.catalog.units()[0]?.id ?? null);
      }
    } catch {
      this.notify.showKey('import.badFile');
    }
    (event.target as HTMLInputElement).value = '';
  }

  /** Adds the products one at a time, so each row gets its own result. */
  protected async run(): Promise<void> {
    if (!this.unitId() || this.running()) {
      return;
    }
    this.running.set(true);
    this.done.set(0);
    for (const row of this.rows()) {
      if (row.result === 'ok') {
        this.done.update((n) => n + 1);
        continue;
      }
      let result: string;
      try {
        await firstValueFrom(
          this.catalog.saveProduct(null, {
            nameEn: row.nameEn,
            nameKm: row.nameKm || null,
            sku: row.sku || null,
            barcode: row.barcode || null,
            categoryId: null,
            baseUnitId: this.unitId()!,
            sellPrice: row.sellPrice,
            reorderLevel: row.reorderLevel,
            leadTimeDays: null,
            trackExpiry: false,
            vatExempt: false,
            units: [],
          }),
        );
        result = 'ok';
      } catch (e) {
        result = this.notify.message(e);
      }
      this.rows.update((list) => list.map((r) => (r.row === row.row ? { ...r, result } : r)));
      this.done.update((n) => n + 1);
    }
    this.running.set(false);
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

/** Rows after the header; rows without a name or price are left out. */
function toRows(table: unknown[][]): ImportRow[] {
  const text = (v: unknown) => (v == null ? '' : String(v).trim());
  const num = (v: unknown) => {
    const n = Number(text(v).replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  return table
    .slice(1)
    .map((cells, i) => ({
      row: i + 2,
      nameEn: text(cells[0]),
      nameKm: text(cells[1]),
      sku: text(cells[2]),
      barcode: text(cells[3]),
      sellPrice: num(cells[4]),
      reorderLevel: text(cells[5]) ? num(cells[5]) : null,
    }))
    .filter((r) => r.nameEn && Number.isFinite(r.sellPrice) && r.sellPrice >= 0);
}
