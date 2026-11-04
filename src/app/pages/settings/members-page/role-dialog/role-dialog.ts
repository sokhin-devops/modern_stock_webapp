import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';

import { ApiService } from '../../../../core/api/api.service';
import { NotifyService } from '../../../../core/notify.service';
import { FieldLabel } from '../../../../shared/field-label/field-label';

export interface PermissionInfo {
  code: string;
  area: string;
  nameEn: string;
  /** Only built-in Owners have it; a custom role can't. */
  ownerOnly: boolean;
}

/** What the dialog opens with: a custom role to edit (id), a new one (no id), or a built-in role to look at. */
export interface RoleDraft {
  id: number | null;
  nameEn: string;
  nameKm: string | null;
  permissions: string[];
  readOnly: boolean;
}

/**
 * A custom role (FR-6.24): its names and the permissions ticked, grouped by area. Owner-only permissions can't be
 * ticked. A built-in role opens read-only.
 */
@Component({
  selector: 'ms-role-dialog',
  imports: [FormsModule, TranslatePipe, Dialog, Checkbox, InputText, ButtonDirective, ButtonLabel, FieldLabel],
  templateUrl: './role-dialog.html',
  styleUrl: './role-dialog.scss',
})
export class RoleDialog {
  readonly draft = input<RoleDraft | null>(null);
  readonly permissions = input<PermissionInfo[]>([]);
  readonly visible = model(false);
  readonly saved = output<void>();

  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  protected readonly nameEn = signal('');
  protected readonly nameKm = signal('');
  protected readonly ticked = signal<Set<string>>(new Set());
  protected readonly busy = signal(false);
  /** Areas in the API's order, each with its permissions. */
  protected readonly areas = computed(() => {
    const byArea = new Map<string, PermissionInfo[]>();
    this.permissions().forEach((p) => byArea.set(p.area, [...(byArea.get(p.area) ?? []), p]));
    return [...byArea].map(([area, list]) => ({ area, list }));
  });
  protected readonly readOnly = computed(() => !!this.draft()?.readOnly);

  constructor() {
    effect(() => {
      const d = this.draft();
      if (this.visible() && d) {
        untracked(() => {
          this.nameEn.set(d.nameEn);
          this.nameKm.set(d.nameKm ?? '');
          this.ticked.set(new Set(d.permissions));
        });
      }
    });
  }

  protected toggle(code: string, on: boolean): void {
    this.ticked.update((all) => {
      const next = new Set(all);
      if (on) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  }

  protected save(): void {
    const d = this.draft();
    if (!d || !this.nameEn().trim()) {
      return;
    }
    const body = { nameEn: this.nameEn().trim(), nameKm: this.nameKm().trim() || null, permissions: [...this.ticked()] };
    this.busy.set(true);
    (d.id ? this.api.put(`/roles/${d.id}`, body) : this.api.post('/roles', body)).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey('roles.saved');
        this.visible.set(false);
        this.saved.emit();
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }
}
