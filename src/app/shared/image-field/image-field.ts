import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonIcon, ButtonLabel } from 'primeng/button';

import { NotifyService } from '../../core/notify.service';

/** Pictures the API takes (FileStorage): JPEG, PNG or WebP up to 2 MB. */
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * A picture with "Choose a picture" and "Remove" (product photo, business logo). It shows the saved picture, or a
 * preview of the one just chosen; the page decides when to upload (pick) or delete (remove). Wrong files are refused
 * here with the same rules as the API.
 */
@Component({
  selector: 'ms-image-field',
  imports: [TranslatePipe, ButtonDirective, ButtonIcon, ButtonLabel],
  templateUrl: './image-field.html',
  styleUrl: './image-field.scss',
})
export class ImageField {
  /** The saved picture's full address, or null. */
  readonly url = input<string | null>(null);
  /** What the picture is, for screen readers ("Product photo"). */
  readonly label = input.required<string>();
  readonly icon = input('pi pi-image');
  readonly disabled = input(false);
  readonly busy = input(false);
  readonly pick = output<File>();
  readonly remove = output<void>();

  private readonly notify = inject(NotifyService);
  private readonly preview = signal<string | null>(null);
  protected readonly shown = computed(() => this.preview() ?? this.url());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearPreview());
  }

  protected choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!TYPES.includes(file.type)) {
      this.notify.showKey('image.wrongType');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.notify.showKey('image.tooBig');
      return;
    }
    this.clearPreview();
    this.preview.set(URL.createObjectURL(file));
    this.pick.emit(file);
  }

  protected clear(): void {
    this.clearPreview();
    this.remove.emit();
  }

  /** Forgets a chosen picture (after the page saved it, or cancelled). */
  reset(): void {
    this.clearPreview();
  }

  private clearPreview(): void {
    const url = this.preview();
    if (url) {
      URL.revokeObjectURL(url);
      this.preview.set(null);
    }
  }
}
