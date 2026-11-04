import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';

import { ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';

interface Member {
  id: number;
  userId: number;
  fullName: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  roleId: number;
  roleCode: string;
  roleNameEn: string;
  roleNameKm: string | null;
  branchId: number | null;
  status: 'ACTIVE' | 'DISABLED' | 'REMOVED';
  canResetPassword: boolean;
}

interface Invitation {
  id: number;
  roleNameEn: string;
  roleNameKm: string | null;
  branchName: string | null;
  email: string | null;
  status: string;
  expiresAt: string;
  link: string | null;
}

interface Role {
  id: number;
  code: string;
  nameEn: string;
  nameKm: string | null;
}

/**
 * Users and roles (prototype members.html, PLAIN.md 11.12): who works in the business, their role and branch, and the
 * invitations. Inviting makes a link to share (email optional); staff without email get a reset link from here.
 */
@Component({
  selector: 'ms-members-page',
  imports: [
    FormsModule, TranslatePipe, DatePipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, Dialog, InputText, Select,
    ButtonDirective, ButtonIcon, ButtonLabel, Tooltip, FieldLabel,
  ],
  templateUrl: './members-page.html',
  styleUrl: './members-page.scss',
})
export class MembersPage {
  private readonly api = inject(ApiService);
  protected readonly business = inject(BusinessService);
  protected readonly lang = inject(LangService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly tab = signal<'members' | 'invitations'>('members');
  protected readonly members = signal<Member[]>([]);
  protected readonly invitations = signal<Invitation[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly canManage = computed(() => this.business.can('member:manage'));
  protected readonly myId = computed(() => this.auth.user()?.id);

  protected readonly roleOptions = computed(() => this.roles().map((r) => ({ value: r.id, label: this.lang.name(r.nameEn, r.nameKm) })));
  protected readonly branchOptions = computed(() => [
    { value: null, label: this.translate.instant('settings.members.allBranches') },
    ...this.business.branches().map((b) => ({ value: b.id, label: this.lang.name(b.nameEn, b.nameKm) })),
  ]);

  // Invite dialog
  protected readonly inviteOpen = signal(false);
  protected readonly inviteRole = signal<number | null>(null);
  protected readonly inviteBranch = signal<number | null>(null);
  protected readonly inviteEmail = signal('');
  protected readonly inviteLink = signal<string | null>(null);
  protected readonly busy = signal(false);

  // Edit dialog
  protected readonly editing = signal<Member | null>(null);
  protected readonly editRole = signal<number | null>(null);
  protected readonly editBranch = signal<number | null>(null);

  // A link to show (reset link)
  protected readonly shownLink = signal<{ title: string; link: string } | null>(null);

  constructor() {
    this.load();
    this.api.get<Role[]>('/roles').subscribe({ next: (r) => this.roles.set(r) });
  }

  protected load(): void {
    this.api.get<Member[]>('/members').subscribe({ next: (m) => this.members.set(m), error: (e) => this.notify.error(e) });
    if (this.canManage()) {
      this.api.get<Invitation[]>('/members/invitations').subscribe({ next: (i) => this.invitations.set(i) });
    }
  }

  protected branchName(id: number | null): string {
    if (id == null) {
      return this.translate.instant('settings.members.allBranches');
    }
    const b = this.business.branches().find((x) => x.id === id);
    return b ? this.lang.name(b.nameEn, b.nameKm) : '';
  }

  protected openInvite(): void {
    this.inviteRole.set(this.roles().find((r) => r.code === 'CASHIER')?.id ?? this.roles()[0]?.id ?? null);
    this.inviteBranch.set(this.business.branchId());
    this.inviteEmail.set('');
    this.inviteLink.set(null);
    this.inviteOpen.set(true);
  }

  protected sendInvite(): void {
    if (!this.inviteRole()) {
      return;
    }
    this.busy.set(true);
    this.api
      .post<Invitation>('/members/invitations', { roleId: this.inviteRole(), branchId: this.inviteBranch(), email: this.inviteEmail().trim() || null })
      .subscribe({
        next: (inv) => {
          this.busy.set(false);
          this.inviteLink.set(inv.link);
          this.notify.showKey('settings.members.inviteSent');
          this.load();
        },
        error: (e) => {
          this.busy.set(false);
          this.notify.error(e);
        },
      });
  }

  protected openEdit(m: Member): void {
    this.editing.set(m);
    this.editRole.set(m.roleId);
    this.editBranch.set(m.branchId);
  }

  protected saveEdit(): void {
    const m = this.editing();
    if (!m) {
      return;
    }
    this.patch(m, { roleId: this.editRole(), branchId: this.editBranch(), allBranches: this.editBranch() == null });
  }

  protected toggleStatus(m: Member): void {
    this.patch(m, { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
  }

  protected remove(m: Member): void {
    this.confirm.confirm({
      header: this.translate.instant('settings.members.remove'),
      message: this.translate.instant('settings.members.removeConfirm', { name: m.fullName }),
      acceptLabel: this.translate.instant('settings.members.remove'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => this.api.delete(`/members/${m.id}`).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) }),
    });
  }

  protected resetLink(m: Member): void {
    this.api.post<{ link: string }>(`/members/${m.id}/reset-link`).subscribe({
      next: (r) => this.shownLink.set({ title: this.translate.instant('settings.members.resetLead', { name: m.fullName }), link: r.link }),
      error: (e) => this.notify.error(e),
    });
  }

  protected resend(inv: Invitation): void {
    this.api.post<Invitation>(`/members/invitations/${inv.id}/resend`).subscribe({
      next: (fresh) => {
        this.load();
        if (fresh.link) {
          this.shownLink.set({ title: this.translate.instant('settings.members.link'), link: fresh.link });
        }
      },
      error: (e) => this.notify.error(e),
    });
  }

  protected cancelInvite(inv: Invitation): void {
    this.api.delete(`/members/invitations/${inv.id}`).subscribe({ next: () => this.load(), error: (e) => this.notify.error(e) });
  }

  protected copy(link: string): void {
    navigator.clipboard?.writeText(link).then(() => this.notify.showKey('settings.members.copied'));
  }

  private patch(m: Member, body: object): void {
    this.api.patch(`/members/${m.id}`, body).subscribe({
      next: () => {
        this.editing.set(null);
        this.notify.showKey('common.saved');
        this.load();
      },
      error: (e) => this.notify.error(e),
    });
  }
}
