import { Component, computed, effect, inject, model, output, signal, input, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { switchMap } from 'rxjs';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { DocLine, LinesEditor, emptyLine } from '../../../shared/lines-editor/lines-editor';
import { filledLines, warehouseOptions } from '../../../shared/options';
import { forkJoin } from 'rxjs';
import { CatalogService } from '../../../core/catalog/catalog.service';

/**
 * A new transfer (prototype transfer-form.html, PLAIN.md 11.3): between two warehouses of a branch (moved at once),
 * or to another branch (sent, in transit, then received there). Save as a draft, or move or send straight away.
 */
/** A draft transfer as the API sends it, to change it. */
export interface DraftTransfer {
  id: number;
  kind: 'MOVE' | 'BRANCH';
  fromWarehouseId: number;
  toWarehouseId: number | null;
  toBranchId: number | null;
  carrierNote: string | null;
  note: string | null;
  lines: { productId: number; unitId: number | null; qty: number }[];
}

@Component({
  selector: 'ms-transfer-form',
  imports: [FormsModule, TranslatePipe, Dialog, InputText, Select, SelectButton, ButtonDirective, ButtonLabel, LinesEditor, FieldLabel],
  templateUrl: './transfer-form.html',
  styleUrl: './transfer-form.scss',
})
export class TransferForm {
  readonly visible = model(false);
  /** A draft transfer to change (PLAIN.md 12.2: draft rows open their edit form). */
  readonly draft = input<DraftTransfer | null>(null);
  readonly saved = output<void>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);
  private readonly catalog = inject(CatalogService);

  protected readonly kinds = [
    { value: 'MOVE', label: 'transfer.MOVE' },
    { value: 'BRANCH', label: 'transfer.BRANCH' },
  ];
  protected readonly kind = signal<'MOVE' | 'BRANCH'>('MOVE');
  protected readonly fromId = signal<number | null>(null);
  protected readonly toWarehouseId = signal<number | null>(null);
  protected readonly toBranchId = signal<number | null>(null);
  protected readonly carrier = signal('');
  protected readonly note = signal('');
  protected readonly lines = signal<DocLine[]>([emptyLine()]);
  protected readonly busy = signal(false);

  protected readonly fromOptions = computed(() => warehouseOptions(this.business.branches(), this.lang, this.business.branchId()));
  /** The branch of the "from" warehouse. */
  private readonly fromBranch = computed(() =>
    this.business.branches().find((b) => b.warehouses.some((w) => w.id === this.fromId()))?.id ?? null,
  );
  protected readonly toWarehouseOptions = computed(() =>
    warehouseOptions(this.business.branches(), this.lang, this.fromBranch()).filter((o) => o.value !== this.fromId()),
  );
  protected readonly toBranchOptions = computed(() =>
    this.business
      .branches()
      .filter((b) => b.id !== this.fromBranch())
      .map((b) => ({ value: b.id, label: this.lang.name(b.nameEn, b.nameKm) })),
  );

  constructor() {
    effect(() => {
      if (this.visible()) {
        const d = untracked(() => this.draft());
        this.kind.set(d?.kind ?? 'MOVE');
        this.fromId.set(d?.fromWarehouseId ?? untracked(() => this.fromOptions()[0]?.value ?? null));
        this.toWarehouseId.set(d?.kind === 'MOVE' ? d.toWarehouseId : null);
        this.toBranchId.set(d?.kind === 'BRANCH' ? d.toBranchId : null);
        this.carrier.set(d?.carrierNote ?? '');
        this.note.set(d?.note ?? '');
        if (d) {
          untracked(() => this.loadLines(d.lines.map((l) => ({ productId: l.productId, unitId: l.unitId, qty: l.qty }))));
        } else {
          this.lines.set([emptyLine()]);
        }
      }
    });
  }

  /** The editor works with whole products: fetch each one once, then rebuild the draft's lines. */
  private loadLines(src: { productId: number; unitId: number | null; qty: number; unitCost?: number | null }[]): void {
    this.lines.set([emptyLine()]);
    if (!src.length) {
      return;
    }
    const ids = [...new Set(src.map((l) => l.productId))];
    forkJoin(ids.map((id) => this.catalog.getProduct(id))).subscribe({
      next: (products) => {
        const byId = new Map(products.map((p) => [p.id, p]));
        this.lines.set([
          ...src.map((l) => {
            const p = byId.get(l.productId) ?? null;
            return { ...emptyLine(), product: p, unitId: p && l.unitId === p.baseUnitId ? null : l.unitId, qty: l.qty, unitCost: l.unitCost ?? null };
          }),
          emptyLine(),
        ]);
      },
      error: (e) => this.notify.error(e),
    });
  }

  /** Saves the draft; with "go", also moves it (same branch) or sends it (other branch). */
  protected submit(go: boolean): void {
    const lines = filledLines(this.lines());
    const move = this.kind() === 'MOVE';
    if (!lines.length || !this.fromId() || (move ? !this.toWarehouseId() : !this.toBranchId())) {
      this.notify.showKey('docs.noLines');
      return;
    }
    const body = {
      fromWarehouseId: this.fromId(),
      toWarehouseId: move ? this.toWarehouseId() : null,
      toBranchId: move ? null : this.toBranchId(),
      carrierNote: this.carrier().trim() || null,
      note: this.note().trim() || null,
      lines: lines.map((l) => ({ productId: l.product!.id, unitId: l.unitId, qty: l.qty })),
    };
    this.busy.set(true);
    const d = this.draft();
    const create$ = d ? this.api.put<{ id: number }>(`/transfers/${d.id}`, body) : this.api.post<{ id: number }>('/transfers', body);
    (go ? create$.pipe(switchMap((t) => this.api.post(`/transfers/${t.id}/${move ? 'move' : 'send'}`))) : create$).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey('transfer.done');
        this.saved.emit();
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
