/**
 * Will this colour pair actually scan?
 *
 * Two independent checks, and the second is the one everyone forgets. Enough
 * contrast is necessary but not sufficient: a code with LIGHT modules on a DARK
 * background fails on a meaningful share of scanners even at 21:1, because many
 * decoders assume dark-on-light and never try the inversion. That is the
 * "looks great, does not scan" bug, and no amount of contrast fixes it.
 */

import { contrastRatio, relativeLuminance, type Rgb } from "./colour.js";

export type ScanReason = "low-contrast" | "inverted" | "transparent-background";

export interface ScanVerdict {
  ok: boolean;
  ratio: number;
  reasons: ScanReason[];
}

/** Comfortable for a phone camera in ordinary light. Below this, warn. */
export const COMFORTABLE_RATIO = 7;
export const MINIMUM_RATIO = 4;

export const scannability = (foreground: Rgb, background: Rgb): ScanVerdict => {
  const ratio = contrastRatio(foreground, background);
  const reasons: ScanReason[] = [];

  if (ratio < MINIMUM_RATIO) reasons.push("low-contrast");
  if (relativeLuminance(foreground) >= relativeLuminance(background)) reasons.push("inverted");
  // A transparent background is unscannable the moment the code is printed on
  // coloured stock or dropped onto a dark page.
  if (background.a < 1) reasons.push("transparent-background");

  return { ok: reasons.length === 0, ratio, reasons };
};

export const describeScan = (verdict: ScanVerdict): string => {
  if (verdict.reasons.includes("inverted")) {
    return "Light modules on a dark background. Many scanners only look for dark-on-light and will not read this, however strong the contrast is.";
  }
  if (verdict.reasons.includes("low-contrast")) {
    return "Not enough contrast between the two colours for a camera to separate them reliably.";
  }
  if (verdict.reasons.includes("transparent-background")) {
    return "A see-through background will not survive being printed or placed on a dark page.";
  }
  if (verdict.ratio < COMFORTABLE_RATIO) {
    return "This will scan, but the contrast is tighter than is comfortable in poor light.";
  }
  return "Good contrast. This should scan reliably.";
};
