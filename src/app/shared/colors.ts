/**
 * The business's own color (FR-6.26), checked and fitted like the API does (ThemeColors.java): red-like and nearly gray
 * colors are refused, and the color is darkened until white text on it passes 4.5:1. From it come the few shades the
 * app uses (src/styles/_prototype.scss), for light and dark mode.
 */

type Rgb = [number, number, number];

const MIN_CONTRAST = 4.5;
const MIN_SATURATION = 0.25;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
/** The dark mode surfaces, to keep the light primary readable on them. */
const DARK_SURFACE: Rgb = [32, 33, 36];
const DARK_PAGE: Rgb = [24, 25, 27];

export type ColorProblem = 'invalid' | 'red' | 'gray';

/** The color as it will be saved, or why it cannot be used. */
export function fitColor(hex: string): { color: string; darkened: boolean } | { problem: ColorProblem } {
  const rgb = parse(hex);
  if (!rgb) {
    return { problem: 'invalid' };
  }
  const [h, s] = hsl(rgb);
  if (s < MIN_SATURATION) {
    return { problem: 'gray' };
  }
  if (h < 20 || h >= 335) {
    return { problem: 'red' };
  }
  let c = rgb;
  for (let i = 0; i < 60 && contrast(c, WHITE) < MIN_CONTRAST; i++) {
    c = c.map((v) => Math.round(v * 0.95)) as Rgb;
  }
  const color = toHex(c);
  return { color, darkened: color !== hex.toLowerCase() };
}

/** CSS for [data-palette="custom"]: the shades of the color in light and dark mode. */
export function paletteCss(hex: string): string {
  const c = parse(hex) ?? [26, 115, 232];
  let darkPrimary = mix(c, WHITE, 0.5);
  for (let i = 0; i < 20 && contrast(darkPrimary, DARK_SURFACE) < MIN_CONTRAST; i++) {
    darkPrimary = mix(darkPrimary, WHITE, 0.15);
  }
  return `
[data-palette="custom"] { --primary: ${toHex(c)}; --primary-hover: ${toHex(mix(c, BLACK, 0.12))}; --on-primary: #ffffff;
  --primary-container: ${toHex(mix(c, WHITE, 0.72))}; --on-primary-container: ${toHex(mix(c, BLACK, 0.74))};
  --primary-soft: ${toHex(mix(c, WHITE, 0.9))}; }
[data-palette="custom"].app-dark { --primary: ${toHex(darkPrimary)}; --primary-hover: ${toHex(mix(darkPrimary, WHITE, 0.3))};
  --on-primary: ${toHex(mix(c, BLACK, 0.6))}; --primary-container: ${toHex(mix(c, BLACK, 0.4))};
  --on-primary-container: ${toHex(mix(c, WHITE, 0.72))}; --primary-soft: ${toHex(mix(c, DARK_PAGE, 0.82))}; }`;
}

export function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

function parse(hex: string): Rgb | null {
  if (!isHexColor(hex)) {
    return null;
  }
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function toHex(c: Rgb): string {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Part of the way from a to b (0 = a, 1 = b). */
function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return a.map((v, i) => v + (b[i] - v) * amount) as Rgb;
}

/** Hue in degrees, saturation and lightness 0..1. */
function hsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return [0, 0, l];
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s, l];
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
