import { AbstractControl, FormGroup } from '@angular/forms';

/**
 * Shows every error of a form, for a submit with missing or wrong fields. PrimeNG paints a field red when it is
 * invalid and dirty (.ng-invalid.ng-dirty), so the fields are marked dirty as well as touched.
 */
export function revealErrors(form: FormGroup): void {
  form.markAllAsTouched();
  Object.values(form.controls).forEach((control) => control.markAsDirty());
}

/** Whether a field's error line shows: the same moment PrimeNG paints the field red. */
export function showError(control: AbstractControl): boolean {
  return control.invalid && control.dirty;
}
