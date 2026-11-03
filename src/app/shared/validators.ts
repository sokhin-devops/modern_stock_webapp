import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Same rule as the API (Phones.KH): 0XX XXX XXX(X) or +855 XX XXX XXX(X). */
export const CAMBODIAN_PHONE = /^(0|\+855\s?)\d{2}\s?\d{3}\s?\d{3,4}$/;

/** Group validator: the two fields must be equal (password and confirm password). */
export function sameAs(field: string, confirm: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null =>
    group.get(field)?.value === group.get(confirm)?.value ? null : { notSame: true };
}
