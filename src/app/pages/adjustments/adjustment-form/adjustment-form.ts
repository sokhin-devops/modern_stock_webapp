import { Component, computed, effect, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { DocLine, LinesEditor, emptyLine } from '../../../shared/lines-editor/lines-editor';
import { filledLines, warehouseOptions } from '../../../shared/options';

const REASONS = ['DAMAGED', 'EXPIRED', 'LOST', 'OWN_USE', 'FOUND', 'CORRECTION', 'OTHER'];

/**
 * A new stock adjustment (prototype adjustment-form.html, PLAIN.md 11.2): opening stock, or stock found, damaged,
 * expired, lost... Positive quantities add stock, negative take it out. Members who may only request it send it for
 * approval.
 */
@Component({
  selector: 'ms-adjustment-form',
  imports: [FormsModule, TranslatePipe, Drawer, InputText, Select, SelectButton, ButtonDirective, ButtonLabel, LinesEditor, FieldLabel],
  templateUrl: './adjustment-form.html',
  styleUrl: './adjustment-form.scss',
})
export class AdjustmentForm {
  readonly visible = model(false);
  readonly saved = output<void>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly translate = inject(TranslateService);
  private readonly notify = inject(NotifyService);

  protected readonly kinds = computed(() =>
    this.business.can('stock:opening')
      ? [
          { value: 'ADJUSTMENT', label: 'adjust.ADJUSTMENT' },
          { value: 'OPENING', label: 'adjust.OPENING' },
        ]
      : [{ value: 'ADJUSTMENT', label: 'adjust.ADJUSTMENT' }],
  );
  protected readonly reasons = computed(() => {
    this.lang.lang();
    return REASONS.map((value) => ({ value, label: this.translate.instant(`adjust.reasons.${value}`) }));
  });
  protected readonly warehouses = computed(() => warehouseOptions(this.business.branches(), this.lang, this.business.branchId()));

  protected readonly kind = signal<'ADJUSTMENT' | 'OPENING'>('ADJUSTMENT');
  protected readonly reason = signal('CORRECTION');
  protected readonly warehouseId = signal<number | null>(null);
  protected readonly note = signal('');
  protected readonly lines = signal<DocLine[]>([emptyLine()]);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.kind.set('ADJUSTMENT');
        this.reason.set('CORRECTION');
        this.warehouseId.set(this.warehouses()[0]?.value ?? null);
        this.note.set('');
        this.lines.set([emptyLine()]);
      }
    });
  }

  protected submit(): void {
    const lines = filledLines(this.lines());
    if (!lines.length || !this.warehouseId()) {
      this.notify.showKey('docs.noLines');
      return;
    }
    const opening = this.kind() === 'OPENING';
    this.busy.set(true);
    this.api
      .post('/adjustments', {
        warehouseId: this.warehouseId(),
        kind: this.kind(),
        reason: opening ? 'OPENING' : this.reason(),
        note: this.note().trim() || null,
        lines: lines.map((l) => ({
          productId: l.product!.id,
          unitId: l.unitId,
          qtyChange: l.qty,
          unitCost: (l.qty ?? 0) > 0 ? l.unitCost : null,
          batchNo: l.batchNo.trim() || null,
          expiryDate: toIsoDate(l.expiryDate),
        })),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.notify.showKey('docs.created');
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
