import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api/api.service';
import { NotifyService } from '../../core/notify.service';

/** Pictures the API takes (FileStorage): JPEG, PNG or WebP up to 2 MB. */
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
/** A phone photo of a receipt is several MB: made this size (longest side) before it goes up. */
const MAX_SIDE = 1600;

/**
 * The photo of a paper document kept with its record (FR-2.10 expense receipt, FR-2.14 supplier invoice). The photo
 * is private, so it comes from the API with the login and shows from memory. On a phone the picker offers the camera;
 * big pictures are made smaller first.
 */
@Component({
  selector: 'ms-doc-photo-dialog',
  imports: [TranslatePipe, Dialog, ButtonDirective, ButtonIcon, ButtonLabel],
  templateUrl: './doc-photo-dialog.html',
  styleUrl: './doc-photo-dialog.scss',
})
export class DocPhotoDialog {
  readonly visible = model(false);
  /** The record's photo endpoint, e.g. /bills/12/photo. */
  readonly path = input.required<string>();
  /** The dialog title, e.g. "Supplier invoice · BILL-202611-0003". */
  readonly header = input('');
  readonly hasPhoto = input(false);
  /** After a photo was added, changed or removed: whether there is one now. */
  readonly changed = output<boolean>();

  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly image = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    // On opening (not when the page passes back the change made here: the picture is already shown)
    effect(() => {
      const open = this.visible();
      const path = this.path();
      untracked(() => {
        this.drop();
        if (open && this.hasPhoto()) {
          this.fetch(path);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.drop());
  }

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) {
      return;
    }
    if (!TYPES.includes(picked.type)) {
      this.notify.showKey('image.wrongType');
      return;
    }
    this.busy.set(true);
    const file = await shrink(picked);
    if (file.size > MAX_BYTES) {
      this.busy.set(false);
      this.notify.showKey('image.tooBig');
      return;
    }
    this.api.upload(this.path(), file).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.showKey('docPhoto.saved');
        this.changed.emit(true);
        this.drop();
        this.image.set(URL.createObjectURL(file));
      },
      error: (e) => {
        this.busy.set(false);
        this.notify.error(e);
      },
    });
  }

  protected remove(): void {
    this.confirm.confirm({
      header: this.translate.instant('docPhoto.remove'),
      message: this.translate.instant('docPhoto.removeConfirm'),
      acceptLabel: this.translate.instant('docPhoto.remove'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: () => {
        this.busy.set(true);
        this.api.delete(this.path()).subscribe({
          next: () => {
            this.busy.set(false);
            this.drop();
            this.notify.showKey('docPhoto.removed');
            this.changed.emit(false);
          },
          error: (e) => {
            this.busy.set(false);
            this.notify.error(e);
          },
        });
      },
    });
  }

  /** The picture at full size in a new tab, to zoom into small print. */
  protected openFull(): void {
    const url = this.image();
    if (url) {
      window.open(url, '_blank', 'noopener');
    }
  }

  private fetch(path: string): void {
    this.loading.set(true);
    this.http.get(`${environment.apiUrl}${path}`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.loading.set(false);
        this.image.set(URL.createObjectURL(blob));
      },
      error: () => {
        this.loading.set(false);
        this.image.set(null);
      },
    });
  }

  private drop(): void {
    const url = this.image();
    if (url) {
      URL.revokeObjectURL(url);
      this.image.set(null);
    }
  }
}

/** A JPEG no bigger than MAX_SIDE on its longest side; small pictures stay as they are. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_BYTES) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file; // the API says what is wrong with it
  }
}
