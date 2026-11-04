import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';

import { ApiService } from '../../../core/api/api.service';
import { PaymentMethod, Supplier } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { toIsoDate } from '../../../shared/dates';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { DocLine, LinesEditor, emptyLine } from '../../../shared/lines-editor/lines-editor';
import { filledLines, receivingWarehouse, warehouseOptions } from '../../../shared/options';

/**
 * Buy from a supplier (prototype po-form.html, PLAIN.md 11.8). "quick": bought at the market, so the purchase is saved,
 * the goods received and (optionally) paid in one step. "order": a draft purchase order, ordered and received later.
 */
@Component({
  selector: 'ms-purchase-form',
  imports: [FormsModule, TranslatePipe, Drawer, AutoComplete, InputText, Select, SelectButton, DatePicker, ButtonDirective, ButtonLabel, LinesEditor, FieldLabel],
  templateUrl: './purchase-form.html',
  styleUrl: './purchase-form.scss',
})
export class PurchaseForm {
  readonly mode = input<'quick' | 'order'>('quick');
  readonly visible = model(false);
  readonly saved = output<void>();

  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly supplier = signal<Supplier | null>(null);
  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly warehouseId = signal<number | null>(null);
  protected readonly invoiceNo = signal('');
  protected readonly expected = signal<Date | null>(null);
  protected readonly note = signal('');
  protected readonly lines = signal<DocLine[]>([emptyLine()]);
  protected readonly payNow = signal(true);
  protected readonly method = signal<PaymentMethod>('CASH');
  protected readonly busy = signal(false);

  protected readonly warehouses = computed(() => warehouseOptions(this.business.branches(), this.lang, this.business.branchId()));
  protected readonly total = computed(() => filledLines(this.lines()).reduce((s, l) => s + (l.qty ?? 0) * (l.unitCost ?? 0), 0));
  protected readonly payOptions = [
    { value: true, label: 'purchase.payNow' },
    { value: false, label: 'purchase.payLater' },
  ];
  protected readonly methods = ['CASH', 'KHQR', 'BANK'].map((m) => ({ value: m, label: `docs.methods.${m}` }));

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.supplier.set(null);
        this.warehouseId.set(receivingWarehouse(this.business.branches(), this.business.branchId()));
        this.invoiceNo.set('');
        this.expected.set(null);
        this.note.set('');
        this.lines.set([emptyLine()]);
        this.payNow.set(true);
        this.method.set('CASH');
      }
    });
  }

  protected findSuppliers(event: AutoCompleteCompleteEvent): void {
    this.api.page<Supplier>('/suppliers', { page: 0, size: 10 }, { q: event.query }).subscribe({ next: (p) => this.suppliers.set(p.content) });
  }

  protected submit(): void {
    const lines = filledLines(this.lines());
    const supplier = this.supplier();
    if (!supplier || !lines.length || !this.warehouseId()) {
      this.notify.showKey('docs.noLines');
      return;
    }
    const branchId = this.business.branches().find((b) => b.warehouses.some((w) => w.id === this.warehouseId()))?.id ?? null;
    this.busy.set(true);
    const call =
      this.mode() === 'quick'
        ? this.api.post('/purchase-orders/quick', {
            supplierId: supplier.id,
            branchId,
            warehouseId: this.warehouseId(),
            supplierInvoiceNo: this.invoiceNo().trim() || null,
            note: this.note().trim() || null,
            lines: lines.map((l) => ({
              productId: l.product!.id,
              unitId: l.unitId,
              qty: l.qty,
              unitCost: l.unitCost ?? 0,
              batchNo: l.batchNo.trim() || null,
              expiryDate: toIsoDate(l.expiryDate),
            })),
            payment: this.payNow() && this.total() > 0 ? { method: this.method(), currency: 'USD', amount: round2(this.total()) } : null,
          })
        : this.api.post('/purchase-orders', {
            supplierId: supplier.id,
            branchId,
            receiveWarehouseId: this.warehouseId(),
            orderDate: toIsoDate(new Date()),
            expectedDate: toIsoDate(this.expected()),
            note: this.note().trim() || null,
            lines: lines.map((l) => ({ productId: l.product!.id, unitId: l.unitId, qty: l.qty, unitCost: l.unitCost ?? 0 })),
          });
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey(this.mode() === 'quick' ? 'purchase.received' : 'docs.created');
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
