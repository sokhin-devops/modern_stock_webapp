import { Component, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Menu pages not built yet: the page keeps its place in the menu and says what comes next. */
@Component({
  selector: 'ms-coming-soon',
  imports: [RouterLink, TranslatePipe, MatButton, MatIcon],
  templateUrl: './coming-soon.html',
  styleUrl: './coming-soon.scss',
})
export class ComingSoon {
  /** Route data "title" (withComponentInputBinding). */
  readonly title = input('comingSoon.title');
}
