/**
 * Colour parsing and WCAG relative luminance.
 *
 * Lifted from withnate-contrast-checker rather than re-derived. The sRGB
 * linearisation threshold - 0.04045, not the 0.03928 that appears in older
 * copies of the spec - is a classic thing to get subtly wrong by hand, and that
 * sibling already has it right and tested. Only the parts a QR code needs are
 * here; the WCAG requirement tables stayed behind.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
  a: number;
}

export const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };
export const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 };

export const MAX_INPUT_LENGTH = 64;

const EPSILON = 1e-9;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const HEX = /^#([0-9a-f]+)$/i;
const FUNCTIONAL = /^(rgba?|hsla?)\(([^)]*)\)$/i;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const PERCENT = /^[+-]?(?:\d+\.?\d*|\.\d+)%$/;
const ANGLE = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg)?$/i;

const num = (token: string): number | null => (NUMBER.test(token) ? Number(token) : null);

const percent = (token: string): number | null =>
  PERCENT.test(token) ? Number(token.slice(0, -1)) : null;

const channel = (token: string): number | null => {
  const p = percent(token);
  if (p !== null) return clamp((p / 100) * 255, 0, 255);
  const n = num(token);
  return n === null ? null : clamp(n, 0, 255);
};

const alpha = (token: string | undefined): number | null => {
  if (token === undefined) return 1;
  const p = percent(token);
  if (p !== null) return clamp(p / 100, 0, 1);
  const n = num(token);
  return n === null ? null : clamp(n, 0, 1);
};

const angle = (token: string): number | null => {
  const m = ANGLE.exec(token);
  if (!m) return null;
  const deg = Number(m[1]);
  return ((deg % 360) + 360) % 360;
};

const splitArguments = (body: string): { parts: string[]; alphaToken: string | undefined } | null => {
  const slashes = body.split("/");
  if (slashes.length > 2) return null;
  const head = slashes[0] ?? "";
  const tail = slashes[1];

  const commaSeparated = head.includes(",");
  const parts = (commaSeparated ? head.split(",") : head.trim().split(/\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (tail !== undefined) {
    if (commaSeparated) return null;
    return { parts, alphaToken: tail.trim() };
  }
  if (commaSeparated && parts.length === 4) {
    return { parts: parts.slice(0, 3), alphaToken: parts[3] };
  }
  return { parts, alphaToken: undefined };
};

const fromHex = (digits: string): Rgb | null => {
  const expand = (s: string): string =>
    s
      .split("")
      .map((c) => c + c)
      .join("");

  let full: string;
  if (digits.length === 3 || digits.length === 4) full = expand(digits);
  else if (digits.length === 6 || digits.length === 8) full = digits;
  else return null;

  const byte = (i: number): number => Number.parseInt(full.slice(i * 2, i * 2 + 2), 16);
  return {
    r: byte(0),
    g: byte(1),
    b: byte(2),
    a: full.length === 8 ? byte(3) / 255 : 1,
  };
};

export const hslToRgb = (hsl: Hsl): Rgb => {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const sector = Math.floor(h / 60) % 6;
  const table: Array<[number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[sector] ?? [0, 0, 0];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a: hsl.a,
  };
};

export const rgbToHsl = (rgb: Rgb): Hsl => {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100, a: rgb.a };
};

export const parseColour = (input: string): Rgb | null => {
  const text = input.trim();
  if (text.length === 0 || text.length > MAX_INPUT_LENGTH) return null;

  const hex = HEX.exec(text);
  if (hex) return fromHex(hex[1] as string);

  const fn = FUNCTIONAL.exec(text);
  if (!fn) return null;

  const name = (fn[1] as string).toLowerCase();
  const split = splitArguments(fn[2] as string);
  if (!split || split.parts.length !== 3) return null;

  const a = alpha(split.alphaToken);
  if (a === null) return null;

  if (name === "rgb" || name === "rgba") {
    const parts = split.parts.map(channel);
    if (parts.some((p) => p === null)) return null;
    const [r, g, b] = parts as number[];
    return { r: Math.round(r as number), g: Math.round(g as number), b: Math.round(b as number), a };
  }

  const h = angle(split.parts[0] as string);
  const s = percent(split.parts[1] as string);
  const l = percent(split.parts[2] as string);
  if (h === null || s === null || l === null) return null;
  return hslToRgb({ h, s, l, a });
};

export const formatRgb = (rgb: Rgb): string =>
  rgb.a >= 1
    ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.round(rgb.a * 1000) / 1000})`;

export const formatHex = (rgb: Rgb): string => {
  const pair = (n: number): string => Math.round(n).toString(16).padStart(2, "0");
  const base = `#${pair(rgb.r)}${pair(rgb.g)}${pair(rgb.b)}`;
  return rgb.a >= 1 ? base : `${base}${pair(rgb.a * 255)}`;
};

export const compositeOver = (fg: Rgb, bg: Rgb): Rgb => {
  if (fg.a >= 1) return { ...fg, a: 1 };
  const blend = (f: number, b: number): number => Math.round(f * fg.a + b * (1 - fg.a));
  return {
    r: blend(fg.r, bg.r),
    g: blend(fg.g, bg.g),
    b: blend(fg.b, bg.b),
    a: 1,
  };
};

export const relativeLuminance = (rgb: Rgb): number => {
  const linear = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
};

export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};
