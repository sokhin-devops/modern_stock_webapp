import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { switchMap } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';
import { FieldLabel } from '../../shared/field-label/field-label';
import { revealErrors } from '../../shared/forms';
import { CAMBODIAN_PHONE } from '../../shared/validators';

const TYPES = ['MINI_MART', 'GROCERY', 'PHARMACY', 'COSMETICS', 'HARDWARE', 'PHONE_SHOP', 'WHOLESALE', 'OTHER'];

/** GET /business/starter: what the wizard adds for a kind of shop. */
interface StarterSet {
  type: string;
  units: { symbol: string; nameEn: string; nameKm: string }[];
  categories: { nameEn: string; nameKm: string }[];
  products: { nameEn: string; nameKm: string; unit: string; price: number; packUnit: string | null; packFactor: number | null }[];
}

/**
 * Setup wizard (prototype setup.html, PLAIN.md 11.12, FR-6.9, FR-6.23): the first branch, today's rate, riel rounding
 * and VAT, then a starter set of units and categories for the kind of shop, with sample products if wanted. Finishing
 * runs PUT /business/onboarding once, which also adds the "Market" supplier.
 */
@Component({
  selector: 'ms-setup',
  imports: [
    ReactiveFormsModule, FormsModule, RouterLink, TranslatePipe, CurrencyPipe, InputText, InputNumber, Select, SelectButton,
    ToggleSwitch, ButtonDirective, ButtonIcon, ButtonLabel, FieldLabel,
  ],
  templateUrl: './setup.html',
  styleUrl: './setup.scss',
})
export class Setup {
  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly translate = inject(TranslateService);

  protected readonly steps = ['setup.branch', 'setup.money', 'setup.starter', 'setup.ready'];
  protected readonly step = signal(0);
  protected readonly busy = signal(false);
  /** Riel rounding steps (PLAIN.md 11.6). */
  protected readonly roundings = [
    { label: '100', value: 100 },
    { label: '500', value: 500 },
    { label: '1,000', value: 1000 },
  ];
  protected readonly types = computed(() => {
    this.lang.lang();
    return TYPES.map((value) => ({ value, label: this.translate.instant(`account.types.${value}`) }));
  });
  protected readonly name = computed(() => {
    const b = this.business.current();
    return b ? this.lang.name(b.nameEn, b.nameKm) : '';
  });
  protected readonly form = inject(NonNullableFormBuilder).group({
    branchName: ['', [Validators.required, Validators.maxLength(120)]],
    phone: ['', Validators.pattern(CAMBODIAN_PHONE)],
    address: ['', Validators.maxLength(255)],
    rate: [4100, [Validators.required, Validators.min(1000), Validators.max(10000)]],
    rounding: [100],
    vat: [false],
  });

  // Step 3: the starter set
  protected readonly starterType = signal<string>(this.business.current()?.businessType ?? 'OTHER');
  protected readonly starter = signal<StarterSet | null>(null);
  protected readonly samples = signal(false);

  constructor() {
    effect(() => {
      const type = this.starterType();
      untracked(() =>
        this.api.get<StarterSet>('/business/starter', { type }).subscribe({
          next: (set) => this.starter.set(set),
          error: (e) => this.notify.error(e),
        }),
      );
    });
  }

  protected typeName(type: string): string {
    return this.types().find((t) => t.value === type)?.label ?? type;
  }

  /** Next step, once this step's fields are right. */
  protected next(): void {
    const fields = [['branchName', 'phone', 'address'], ['rate', 'rounding', 'vat']][this.step()] ?? [];
    const controls = fields.map((f) => this.form.get(f)!);
    if (controls.some((c) => c.invalid)) {
      controls.forEach((c) => {
        c.markAsTouched();
        c.markAsDirty();
      });
      return;
    }
    this.step.update((s) => Math.min(s + 1, this.steps.length - 1));
  }

  protected back(): void {
    this.step.update((s) => Math.max(s - 1, 0));
  }

  /** Steps already passed can be opened again from the step list. */
  protected goTo(index: number): void {
    if (index < this.step()) {
      this.step.set(index);
    }
  }

  protected submit(): void {
    if (this.form.invalid) {
      revealErrors(this.form);
      this.step.set(this.form.controls.branchName.invalid || this.form.controls.phone.invalid ? 0 : 1);
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.business
      .onboard({
        mainBranch: { nameEn: v.branchName.trim(), phone: v.phone || null, address: v.address || null },
        usdToKhr: v.rate,
        vatEnabled: v.vat,
        rielRounding: v.rounding,
        starterType: this.starterType(),
        sampleProducts: this.samples(),
      })
      .pipe(switchMap(() => this.business.loadContext()))
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }
}
