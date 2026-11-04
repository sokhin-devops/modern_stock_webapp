import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';

import { Product, ProductRequest } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { revealErrors } from '../../../shared/forms';

/**
 * Add or edit a product (prototype drw-product) in a drawer beside the list: names, codes, category, stock unit,
 * price, reorder level, expiry tracking, and bigger units such as a box of 24. Members without "manage products"
 * see the same drawer read-only.
 */
@Component({
  selector: 'ms-product-form',
  imports: [
    ReactiveFormsModule, TranslatePipe, Drawer, InputText, InputNumber, Select, ToggleSwitch, ButtonDirective,
    ButtonIcon, ButtonLabel, Tooltip, FieldLabel,
  ],
  templateUrl: './product-form.html',
  styleUrl: './product-form.scss',
})
export class ProductForm {
  /** The product to edit, or null for a new one. */
  readonly product = input<Product | null>(null);
  readonly visible = model(false);
  readonly saved = output<Product>();

  protected readonly catalog = inject(CatalogService);
  private readonly business = inject(BusinessService);
  private readonly lang = inject(LangService);
  private readonly translate = inject(TranslateService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly busy = signal(false);
  protected readonly canManage = computed(() => this.business.can('product:manage'));

  protected readonly categoryOptions = computed(() =>
    this.catalog.categories().map((c) => ({ value: c.id, label: this.lang.name(c.nameEn, c.nameKm) })),
  );
  protected readonly unitOptions = computed(() =>
    this.catalog.units().map((u) => ({ value: u.id, label: `${this.lang.name(u.nameEn, u.nameKm)} (${u.symbol})` })),
  );

  protected readonly form = this.fb.group({
    nameEn: ['', [Validators.required, Validators.maxLength(160)]],
    nameKm: ['', Validators.maxLength(160)],
    sku: ['', Validators.maxLength(40)],
    barcode: ['', Validators.maxLength(40)],
    categoryId: this.fb.control<number | null>(null),
    baseUnitId: this.fb.control<number | null>(null, Validators.required),
    sellPrice: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    reorderLevel: this.fb.control<number | null>(null, Validators.min(0)),
    leadTimeDays: this.fb.control<number | null>(null, Validators.min(0)),
    trackExpiry: [false],
    vatExempt: [false],
    units: this.fb.array<ReturnType<ProductForm['unitGroup']>>([]),
  });

  constructor() {
    // Fill the form each time the drawer opens.
    effect(() => {
      if (this.visible()) {
        this.reset(this.product());
      }
    });
  }

  protected get units(): FormArray<ReturnType<ProductForm['unitGroup']>> {
    return this.form.controls.units;
  }

  protected addUnit(): void {
    this.units.push(this.unitGroup());
  }

  protected removeUnit(index: number): void {
    this.units.removeAt(index);
    this.units.markAsDirty();
  }

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      this.units.controls.forEach((group) => revealErrors(group));
      return;
    }
    const v = this.form.getRawValue();
    const body: ProductRequest = {
      nameEn: v.nameEn.trim(),
      nameKm: v.nameKm.trim() || null,
      sku: v.sku.trim() || null,
      barcode: v.barcode.trim() || null,
      categoryId: v.categoryId,
      baseUnitId: v.baseUnitId!,
      sellPrice: v.sellPrice ?? 0,
      reorderLevel: v.reorderLevel,
      leadTimeDays: v.leadTimeDays,
      trackExpiry: v.trackExpiry,
      vatExempt: v.vatExempt,
      units: v.units.map((u) => ({ unitId: u.unitId!, factor: u.factor!, barcode: u.barcode.trim() || null, sellPrice: u.sellPrice })),
    };
    this.busy.set(true);
    this.catalog.saveProduct(this.product()?.id ?? null, body).subscribe({
      next: (product) => {
        this.busy.set(false);
        this.notify.showKey('common.saved');
        this.saved.emit(product);
        this.visible.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected deactivate(): void {
    const product = this.product();
    if (!product) {
      return;
    }
    this.confirm.confirm({
      header: this.translate.instant('products.deactivate'),
      message: this.translate.instant('products.deactivateConfirm', { name: this.lang.name(product.nameEn, product.nameKm) }),
      acceptLabel: this.translate.instant('products.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () =>
        this.catalog.deactivateProduct(product.id).subscribe({
          next: () => {
            this.notify.showKey('products.deactivated');
            this.saved.emit({ ...product, active: false });
            this.visible.set(false);
          },
          error: (e) => this.notify.error(e),
        }),
    });
  }

  private unitGroup() {
    return this.fb.group({
      unitId: this.fb.control<number | null>(null, Validators.required),
      factor: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.0001)]),
      barcode: ['', Validators.maxLength(40)],
      sellPrice: this.fb.control<number | null>(null, Validators.min(0)),
    });
  }

  private reset(product: Product | null): void {
    this.units.clear();
    (product?.units ?? []).forEach(() => this.units.push(this.unitGroup()));
    const pieces = this.catalog.units().find((u) => u.symbol === 'pcs')?.id ?? this.catalog.units()[0]?.id ?? null;
    this.form.reset({
      nameEn: product?.nameEn ?? '',
      nameKm: product?.nameKm ?? '',
      sku: product?.sku ?? '',
      barcode: product?.barcode ?? '',
      categoryId: product?.categoryId ?? null,
      baseUnitId: product?.baseUnitId ?? pieces,
      sellPrice: product?.sellPrice ?? null,
      reorderLevel: product?.reorderLevel ?? null,
      leadTimeDays: product?.leadTimeDays ?? null,
      trackExpiry: product?.trackExpiry ?? false,
      vatExempt: product?.vatExempt ?? false,
      units: (product?.units ?? []).map((u) => ({ unitId: u.unitId, factor: u.factor, barcode: u.barcode ?? '', sellPrice: u.sellPrice })),
    });
    if (this.canManage()) {
      this.form.enable();
    } else {
      this.form.disable();
    }
  }
}
