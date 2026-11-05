import { Component, effect, inject, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';

import { ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BusinessService } from '../../../core/business/business.service';
import { NotifyService } from '../../../core/notify.service';

interface Cashier {
  userId: number;
  fullName: string;
}

/**
 * Switch cashier on a shared POS device (FR-6.19): pick who takes over and type their PIN. The device then starts
 * again as that person, in the same business and branch, with their own shift. Five wrong PINs lock that PIN for a while.
 */
@Component({
  selector: 'ms-switch-dialog',
  imports: [FormsModule, TranslatePipe, Dialog, InputText, ButtonDirective, ButtonLabel],
  templateUrl: './switch-dialog.html',
  styleUrl: './switch-dialog.scss',
})
export class SwitchDialog {
  readonly visible = model(false);

  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);
  private readonly business = inject(BusinessService);
  private readonly notify = inject(NotifyService);

  protected readonly cashiers = signal<Cashier[] | null>(null);
  protected readonly picked = signal<Cashier | null>(null);
  protected readonly pin = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => {
          this.cashiers.set(null);
          this.picked.set(null);
          this.pin.set('');
          const me = this.auth.user()?.id;
          this.api.get<Cashier[]>('/pos/cashiers').subscribe({
            next: (list) => this.cashiers.set(list.filter((c) => c.userId !== me)),
            error: (e) => this.notify.error(e),
          });
        });
      }
    });
  }

  protected pick(c: Cashier): void {
    this.picked.set(c);
    this.pin.set('');
  }

  protected submit(): void {
    const c = this.picked();
    const businessId = this.business.businessId();
    const pin = this.pin().trim();
    if (!c || !businessId || !/^\d{4,6}$/.test(pin)) {
      return;
    }
    this.busy.set(true);
    this.auth.pinSwitch(businessId, c.userId, pin).subscribe({
      // The app starts again as the new cashier: their permissions, their shift (same business and branch)
      next: () => window.location.reload(),
      error: (e) => {
        this.busy.set(false);
        this.pin.set('');
        this.notify.error(e);
      },
    });
  }
}
