import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';

import { CashShift } from '../../../core/api/models';
import { NotifyService } from '../../../core/notify.service';
import { PosService } from '../../../core/sales/pos.service';
import { FieldLabel } from '../../../shared/field-label/field-label';

/**
 * Open or close my cash shift (prototype dlg-shift, PLAIN.md 11.5). Opening counts the cash in the drawer; closing
 * shows what should be there and records what was counted, so the shift report shows any difference.
 */
@Component({
  selector: 'ms-shift-dialog',
  imports: [FormsModule, TranslatePipe, DecimalPipe, DatePipe, Dialog, InputNumber, InputText, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './shift-dialog.html',
  styleUrl: './shift-dialog.scss',
})
export class ShiftDialog {
  readonly visible = model(false);
  /** The open shift to close, or null to open one. */
  readonly shift = input<CashShift | null>(null);
  readonly branchId = input.required<number>();
  readonly changed = output<CashShift | null>();

  private readonly pos = inject(PosService);
  private readonly notify = inject(NotifyService);

  protected readonly usd = signal<number | null>(null);
  protected readonly khr = signal<number | null>(null);
  protected readonly note = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.usd.set(null);
        this.khr.set(null);
        this.note.set('');
      }
    });
  }

  protected submit(): void {
    const shift = this.shift();
    this.busy.set(true);
    const call = shift
      ? this.pos.closeShift(shift.id, this.usd() ?? 0, this.khr() ?? 0, this.note().trim() || null)
      : this.pos.openShift(this.branchId(), this.usd() ?? 0, this.khr() ?? 0);
    call.subscribe({
      next: (result) => {
        this.busy.set(false);
        this.notify.showKey(shift ? 'pos.shiftClosed' : 'pos.shiftOpened');
        this.changed.emit(shift ? null : result);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
