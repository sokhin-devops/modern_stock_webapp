import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { MultiSelect } from 'primeng/multiselect';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';

import { ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BusinessService } from '../../../core/business/business.service';
import { LangService } from '../../../core/lang.service';
import { NotifyService } from '../../../core/notify.service';
import { FieldLabel } from '../../../shared/field-label/field-label';
import { QrCode } from '../../../shared/qr-code/qr-code';
import { PermissionInfo, RoleDialog, RoleDraft } from './role-dialog/role-dialog';

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
  /** The first branch; null = all branches. */
  branchId: number | null;
  /** Every branch the member works in; null = all branches. */
  branchIds: number[] | null;
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
  builtIn: boolean;
  permissions: string[];
}

/**
 * Users and roles (prototype members.html, PLAIN.md 11.12): who works in the business, their role and branches, the
 * invitations, and the roles. Inviting makes a link to share (email optional); staff without email get a reset link
 * from here. The Owner can add custom roles (FR-6.24) and give a member several branches (FR-6.18).
 */
@Component({
  selector: 'ms-members-page',
  imports: [
    FormsModule, TranslatePipe, DatePipe, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, Dialog, InputText, Select,
    ButtonDirective, ButtonIcon, ButtonLabel, Tooltip, FieldLabel, QrCode, MultiSelect, ToggleSwitch, RoleDialog,
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

  protected readonly tab = signal<'members' | 'invitations' | 'roles'>('members');
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
  protected readonly branchChoices = computed(() =>
    this.business.branches().map((b) => ({ value: b.id, label: this.lang.name(b.nameEn, b.nameKm) })),
  );

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
  protected readonly editAll = signal(true);
  protected readonly editBranches = signal<number[]>([]);

  // Roles (FR-6.24)
  protected readonly permissionList = signal<PermissionInfo[]>([]);
  protected readonly roleDraft = signal<RoleDraft | null>(null);
  protected readonly roleOpen = signal(false);
  protected readonly customCount = computed(() => this.roles().filter((r) => !r.builtIn).length);

  // A link to show (reset link)
  protected readonly shownLink = signal<{ title: string; link: string } | null>(null);

  constructor() {
    this.load();
    this.loadRoles();
    this.api.get<PermissionInfo[]>('/permissions').subscribe({ next: (p) => this.permissionList.set(p) });
  }

  protected loadRoles(): void {
    this.api.get<Role[]>('/roles').subscribe({ next: (r) => this.roles.set(r) });
  }

  protected memberCount(role: Role): number {
    return this.members().filter((m) => m.roleId === role.id).length;
  }

  /** A built-in role opens to look at; a custom one to change. */
  protected openRole(role: Role): void {
    this.roleDraft.set({
      id: role.builtIn ? null : role.id,
      nameEn: role.nameEn,
      nameKm: role.nameKm,
      permissions: role.permissions,
      readOnly: role.builtIn || !this.canManage(),
    });
    this.roleOpen.set(true);
  }

  /** A new role, empty or as a copy of another (without owner-only permissions). */
  protected newRole(from?: Role): void {
    const ownerOnly = new Set(this.permissionList().filter((p) => p.ownerOnly).map((p) => p.code));
    this.roleDraft.set({
      id: null,
      nameEn: from ? this.translate.instant('roles.copyOf', { name: from.nameEn }) : '',
      nameKm: from?.nameKm ? this.translate.instant('roles.copyOf', { name: from.nameKm }) : null,
      permissions: (from?.permissions ?? []).filter((p) => !ownerOnly.has(p)),
      readOnly: false,
    });
    this.roleOpen.set(true);
  }

  protected deleteRole(role: Role): void {
    this.confirm.confirm({
      header: this.translate.instant('roles.delete'),
      message: this.translate.instant('roles.deleteConfirm', { name: this.lang.name(role.nameEn, role.nameKm) }),
      acceptLabel: this.translate.instant('roles.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () =>
        this.api.delete(`/roles/${role.id}`).subscribe({
          next: () => {
            this.notify.showKey('roles.deleted');
            this.loadRoles();
          },
          error: (e) => this.notify.error(e),
        }),
    });
  }

  protected load(): void {
    this.api.get<Member[]>('/members').subscribe({ next: (m) => this.members.set(m), error: (e) => this.notify.error(e) });
    if (this.canManage()) {
      this.api.get<Invitation[]>('/members/invitations').subscribe({ next: (i) => this.invitations.set(i) });
    }
  }

  /** "All branches", or the names of the member's branches. */
  protected branchNames(ids: number[] | null): string {
    if (ids == null) {
      return this.translate.instant('settings.members.allBranches');
    }
    return ids
      .map((id) => this.business.branches().find((x) => x.id === id))
      .filter((b) => !!b)
      .map((b) => this.lang.name(b!.nameEn, b!.nameKm))
      .join(', ');
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
    this.editAll.set(m.branchIds == null);
    this.editBranches.set(m.branchIds ?? (this.business.branchId() != null ? [this.business.branchId()!] : []));
  }

  protected saveEdit(): void {
    const m = this.editing();
    if (!m) {
      return;
    }
    this.patch(m, this.editAll() ? { roleId: this.editRole(), allBranches: true } : { roleId: this.editRole(), branchIds: this.editBranches() });
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

  /** Opens Telegram's share screen with the link and a short line, to send it to the person (FR-6.12). */
  protected telegramShare(link: string): string {
    const text = this.translate.instant('settings.members.telegramText');
    return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
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
