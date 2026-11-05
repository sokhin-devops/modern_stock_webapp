import { Component, computed, effect, inject, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';

import { ApiService } from '../../../core/api/api.service';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { DocLine, LinesEditor, emptyLine } from '../../../shared/lines-editor/lines-editor';
import { filledLines } from '../../../shared/options';

/**
 * A transfer request (FR-4.11): my branch asks another branch for goods, by when if it matters. The other branch makes
 * the transfer from it, or declines.
 */
@Component({
  selector: 'ms-request-form',
  imports: [FormsModule, TranslatePipe, Drawer, InputText, Select, DatePicker, ButtonDirective, ButtonLabel, LinesEditor, FieldLabel],
  templateUrl: './request-form.html',
})
export class RequestForm {
  readonly visible = model(false);
  readonly saved = output<{ id: number }>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly toBranchId = signal<number | null>(null);
  protected readonly fromBranchId = signal<number | null>(null);
  protected readonly neededBy = signal<Date | null>(null);
  protected readonly note = signal('');
  protected readonly lines = signal<DocLine[]>([emptyLine()]);
  protected readonly busy = signal(false);
  protected readonly today = new Date();

  /** The branch asking: one I work in. */
  protected readonly toOptions = computed(() =>
    this.business
      .pickableBranches()
      .filter((b) => b.active && !b.readOnly)
      .map((b) => ({ value: b.id, label: this.lang.name(b.nameEn, b.nameKm) })),
  );
  /** The branch asked: any other open branch. */
  protected readonly fromOptions = computed(() =>
    this.business
      .branches()
      .filter((b) => b.active && b.id !== this.toBranchId())
      .map((b) => ({ value: b.id, label: this.lang.name(b.nameEn, b.nameKm) })),
  );

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => {
          const selected = this.business.branchId();
          this.toBranchId.set(this.toOptions().some((o) => o.value === selected) ? selected : (this.toOptions()[0]?.value ?? null));
          this.fromBranchId.set(this.fromOptions()[0]?.value ?? null);
          this.neededBy.set(null);
          this.note.set('');
          this.lines.set([emptyLine()]);
        });
      }
    });
  }

  protected setTo(id: number | null): void {
    this.toBranchId.set(id);
    if (this.fromBranchId() === id) {
      this.fromBranchId.set(this.fromOptions()[0]?.value ?? null);
    }
  }

  protected submit(): void {
    const lines = filledLines(this.lines());
    if (!lines.length || !this.fromBranchId() || !this.toBranchId()) {
      this.notify.showKey('docs.noLines');
      return;
    }
    const neededBy = this.neededBy();
    const body = {
      fromBranchId: this.fromBranchId(),
      toBranchId: this.toBranchId(),
      neededBy: neededBy ? toIsoDate(neededBy) : null,
      note: this.note().trim() || null,
      lines: lines.map((l) => ({ productId: l.product!.id, unitId: l.unitId, qty: l.qty })),
    };
    this.busy.set(true);
    this.api.post<{ id: number; number: string }>('/transfer-requests', body).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.notify.showKey('requests.sent', { number: r.number });
        this.saved.emit(r);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
