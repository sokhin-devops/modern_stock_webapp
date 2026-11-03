import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';

import { ProblemDetail } from './api/models';

/** Short messages at the bottom of the screen (the prototype's toasts), with Angular Material's snack bar. */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  show(message: string): void {
    this.snackBar.open(message, undefined, { duration: 3500 });
  }

  /** Translation key or plain text. */
  showKey(key: string, params?: Record<string, unknown>): void {
    this.show(this.translate.instant(key, params));
  }

  error(error: unknown): void {
    this.snackBar.open(this.message(error), this.translate.instant('common.close'), { duration: 6000 });
  }

  /** The API's translated message (ProblemDetail.detail), or a friendly fallback. */
  message(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const problem = error.error as Partial<ProblemDetail> | null;
      if (problem?.detail) {
        return problem.detail;
      }
      return this.translate.instant(error.status === 0 ? 'errors.network' : 'errors.server');
    }
    return this.translate.instant('errors.server');
  }
}

/** The API error code (for example INSUFFICIENT_STOCK), to react to specific errors. */
export function errorCode(error: unknown): string | null {
  return error instanceof HttpErrorResponse ? ((error.error as Partial<ProblemDetail> | null)?.code ?? null) : null;
}
