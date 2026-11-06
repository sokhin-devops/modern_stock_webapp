import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';

import { DialogEscape } from './core/dialog-escape';
import { SplashService } from './core/splash.service';

/** The root hosts the router (auth pages, the account shell, or the business shell), the toasts and the confirm dialog. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast, ConfirmDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor() {
    inject(SplashService).hideWhenReady();
    inject(DialogEscape).start();
  }
}
