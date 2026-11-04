import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, ControlContainer, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { map, of, startWith, switchMap } from 'rxjs';

/** What the label knows about its field. */
interface FieldState {
  required: boolean;
  error: 'required' | 'other' | null;
}

const NONE: FieldState = { required: false, error: null };

/**
 * The label above a form field, the same size everywhere (the prototype's .label). A required field gets a red *.
 * Once the form shows its errors (revealErrors, or the field was edited), the label turns red and says what is wrong
 * next to the name: "Name is required" ("ឈ្មោះ គឺទាមទារ"), or the name and the `error` text for any other mistake.
 * Nothing is written under the field (hints stay there).
 *
 *   <label msLabel for="pt-name" control="name">{{ 'partners.name' | translate }}</label>
 *
 * `control` is the field's name in the surrounding form group (or the control itself); required comes from its
 * validators. A field without a form control (ngModel) can be marked `required`. On a <span>, it labels a group such
 * as a select button (with aria-labelledby).
 */
@Component({
  selector: 'label[msLabel], span[msLabel]',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ms-label', '[class.invalid]': 'shown() !== null' },
  templateUrl: './field-label.html',
  styleUrl: './field-label.scss',
})
export class FieldLabel {
  /** The field: its name in the surrounding form group, or the control. */
  readonly control = input<string | AbstractControl | null>(null);
  /** Marks the field required when it has no control that says so. */
  readonly required = input(false, { transform: booleanAttribute });
  readonly optional = input(false, { transform: booleanAttribute });
  /** What to say for a mistake other than a missing value (an i18n key); without it, "… is not valid". */
  readonly error = input<string | null>(null);
  /** Shows `error` while the control itself is valid: a rule across fields, such as two passwords that differ. */
  readonly invalid = input(false, { transform: booleanAttribute });

  private readonly container = inject(ControlContainer, { optional: true });

  private readonly field = computed(() => {
    const control = this.control();
    return typeof control === 'string' ? (this.container?.control?.get(control) ?? null) : control;
  });

  /** Follows the control: its validators, value, and whether it was edited or the form was submitted. */
  private readonly state = toSignal(
    toObservable(this.field).pipe(switchMap((c) => (c ? c.events.pipe(startWith(null), map(() => stateOf(c))) : of(NONE)))),
    { initialValue: NONE },
  );

  /** The mistake to show: a missing value, another one, or none. */
  protected readonly shown = computed(() => (this.invalid() ? 'other' : this.state().error));
  protected readonly star = computed(() => (this.required() || this.state().required) && this.shown() === null);
}

/** Errors show at the moment PrimeNG paints the field red (invalid and dirty), as in shared/forms. */
function stateOf(control: AbstractControl): FieldState {
  return {
    required: control.hasValidator(Validators.required),
    error: control.invalid && control.dirty ? (control.hasError('required') ? 'required' : 'other') : null,
  };
}
