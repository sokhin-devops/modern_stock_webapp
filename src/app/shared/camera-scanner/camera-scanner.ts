import { Component, ElementRef, input, model, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonDirective, ButtonLabel } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

/** The part of @zxing/browser's controls we use. */
interface ScanControls {
  stop(): void;
}

/**
 * Scans barcodes with the phone's camera (FR-4.9: count on a phone with the camera). It keeps scanning while open; the
 * same code is ignored for a moment, so one item held in front of the camera is counted once. The scanner library
 * (@zxing/browser) loads only when the camera opens.
 */
@Component({
  selector: 'ms-camera-scanner',
  imports: [TranslatePipe, Dialog, ButtonDirective, ButtonLabel],
  templateUrl: './camera-scanner.html',
  styleUrl: './camera-scanner.scss',
})
export class CameraScanner {
  readonly visible = model(false);
  /** A line under the picture, e.g. what the last scan counted. */
  readonly message = input<string | null>(null);
  readonly scan = output<string>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  /** A translation key when the camera can't be used. */
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);
  private controls: ScanControls | null = null;
  private last = { code: '', at: 0 };

  protected async start(): Promise<void> {
    this.error.set(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      // Browsers only give the camera to pages opened over https (or on this computer)
      this.error.set('scanner.insecure');
      return;
    }
    const element = this.video()?.nativeElement;
    if (!element) {
      return;
    }
    this.starting.set(true);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      this.controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, element, (result) => {
        if (result) {
          this.found(result.getText());
        }
      });
      if (!this.visible()) {
        this.stop();
      }
    } catch (e) {
      const name = (e as { name?: string })?.name;
      this.error.set(name === 'NotAllowedError' ? 'scanner.denied' : name === 'NotFoundError' ? 'scanner.noCamera' : 'scanner.failed');
    } finally {
      this.starting.set(false);
    }
  }

  protected stop(): void {
    this.controls?.stop();
    this.controls = null;
  }

  private found(code: string): void {
    const now = Date.now();
    if (code === this.last.code && now - this.last.at < 1500) {
      return;
    }
    this.last = { code, at: now };
    navigator.vibrate?.(60);
    this.scan.emit(code);
  }
}
