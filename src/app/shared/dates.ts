/** Dates as the API sends them (yyyy-MM-dd, the business's day) and as PrimeNG's date picker wants them. */
export function toIsoDate(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Today in the browser, as yyyy-MM-dd. */
export function today(): string {
  return toIsoDate(new Date())!;
}
