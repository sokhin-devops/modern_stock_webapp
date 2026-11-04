import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { TableModule } from 'primeng/table';

import { ApiService } from '../../../core/api/api.service';
import { Branch } from '../../../core/api/models';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { BranchForm } from '../branch-form/branch-form';

/** Branches (prototype branches.html, PLAIN.md 11.11): every branch with its warehouses; add, edit, deactivate. */
@Component({
  selector: 'ms-branches-page',
  imports: [TranslatePipe, TableModule, ButtonDirective, ButtonIcon, ButtonLabel, BranchForm],
  templateUrl: './branches-page.html',
  styleUrl: './branches-page.scss',
})
export class BranchesPage {
  private readonly api = inject(ApiService);
  private readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly notify = inject(NotifyService);

  protected readonly branches = signal<Branch[]>([]);
  protected readonly loading = signal(true);
  protected readonly canManage = computed(() => this.business.can('business:manage'));
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Branch | null>(null);

  constructor() {
    this.load();
  }

  protected open(branch: Branch | null): void {
    this.editing.set(branch);
    this.formOpen.set(true);
  }

  /** After a change: this list, and the branch selector in the top bar. */
  protected load(): void {
    this.loading.set(true);
    this.api.get<Branch[]>('/branches').subscribe({
      next: (list) => {
        this.branches.set(list);
        this.loading.set(false);
        const open = this.editing();
        if (open) {
          this.editing.set(list.find((b) => b.id === open.id) ?? null);
        }
      },
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
    this.business.loadContext().subscribe();
  }

  protected warehouseNames(b: Branch): string {
    return b.warehouses.filter((w) => w.active).map((w) => this.lang.name(w.nameEn, w.nameKm)).join(', ');
  }
}
