import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { DialogService } from 'primeng/dynamicdialog';
import { ProgressSpinner } from 'primeng/progressspinner';

import { MyBusiness, MyInvitation } from '../../core/api/models';
import { BusinessService } from '../../core/business/business.service';
import { LangService } from '../../core/lang.service';
import { NotifyService } from '../../core/notify.service';
import { CreateBusinessDialog } from '../create-business-dialog/create-business-dialog';

/** My businesses (prototype businesses.html): open one, accept an invitation, or create a new business. */
@Component({
  selector: 'ms-businesses',
  imports: [TranslatePipe, ButtonDirective, ButtonIcon, ButtonLabel, ProgressSpinner],
  providers: [DialogService],
  templateUrl: './businesses.html',
  styleUrl: './businesses.scss',
})
export class Businesses implements OnInit {
  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly dialog = inject(DialogService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.business.loadMine().subscribe({
      next: () => this.loading.set(false),
      error: (e) => {
        this.loading.set(false);
        this.notify.error(e);
      },
    });
  }

  protected open(b: MyBusiness): void {
    this.business.open(b.id);
    if (!b.onboardingCompleted) {
      this.router.navigate(['/setup']);
      return;
    }
    this.business.loadContext().subscribe(() => this.router.navigate(['/dashboard']));
  }

  protected create(): void {
    this.dialog
      .open(CreateBusinessDialog, {
        header: this.translate.instant('account.newBusiness'),
        closeAriaLabel: this.translate.instant('common.close'),
        width: '560px',
        breakpoints: { '640px': 'calc(100vw - 32px)' },
        modal: true,
        closable: true,
        focusOnShow: true,
      })
      .onClose.subscribe((created?: MyBusiness) => {
        if (created) {
          this.business.open(created.id);
          this.router.navigate(['/setup']);
        }
      });
  }

  protected accept(invitation: MyInvitation): void {
    this.business.acceptInvitation(invitation.id).subscribe({
      next: (b) => this.business.loadMine().subscribe(() => this.open(b)),
      error: (e) => this.notify.error(e),
    });
  }

  protected decline(invitation: MyInvitation): void {
    this.business.declineInvitation(invitation.id).subscribe({
      next: () => this.business.invitations.update((list) => list.filter((i) => i.id !== invitation.id)),
      error: (e) => this.notify.error(e),
    });
  }

  protected initials(b: MyBusiness): string {
    return b.nameEn.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }
}
