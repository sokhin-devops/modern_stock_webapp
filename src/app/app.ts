import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';

import { SplashService } from './core/splash.service';

/** The root hosts the router (auth pages, the account shell, or the business shell) and the toasts. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor() {
    inject(SplashService).hideWhenReady();
  }
}
