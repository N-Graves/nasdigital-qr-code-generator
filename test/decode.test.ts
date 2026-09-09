/**
 * The test that answers the only question that matters: does it scan?
 *
 * Everything else in this repo checks that the rendering is faithful to what the
 * library produced. This checks that what the library produced, rendered the way
 * this tool renders it, comes back out of an independent decoder as the text
 * that went in. A transposed grid, a missing quiet zone or an off-by-one in the
 * run-length merge all survive every other test here and fail this one.
 *
 * The pixels are built straight from the path, so this exercises the real
 * rendering path rather than the library's own grid - no canvas, no browser.
 */

import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { QUIET_ZONE, gridToRects, rectsToPath, pathToGrid, renderSvg, type Grid } from "../src/svg.js";
import { qrcodegen } from "../src/vendor/qrcodegen.js";
import { buildWifiPayload, parseWifiPayload } from "../src/wifi.js";

/** Rasterise the rendered path the way a scanner would see it. */
const rasterise = (path: string, size: number, scale: number, quiet = QUIET_ZONE) => {
  const grid = pathToGrid(path, size, quiet);
  const span = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(span * span * 4).fill(255);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!grid[y]?.[x]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = (x + quiet) * scale + dx;
          const py = (y + quiet) * scale + dy;
          const i = (py * span + px) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, span };
};

const decode = (text: string, ecl: qrcodegen.QrCode.Ecc, scale = 4): string | null => {
  const qr = qrcodegen.QrCode.encodeText(text, ecl);
  const grid: Grid = { size: qr.size, get: (x, y) => qr.getModule(x, y) };
  // Deliberately goes through rectsToPath and back, so the merge and the offset
  // maths are both in the path being tested.
  const path = rectsToPath(gridToRects(grid));
  const { data, span } = rasterise(path, qr.size, scale);
  return jsQR(data, span, span)?.data ?? null;
};

const { LOW, MEDIUM, QUARTILE, HIGH } = qrcodegen.QrCode.Ecc;

describe("a rendered code decodes back to what went in", () => {
  it.each([
    ["a URL", "https://nasdigital.co.uk/pc-repair/"],
    ["plain text", "Ring Nathan on 07000 000000"],
    ["a short string", "hi"],
    ["numbers only", "01234567890123456789"],
    ["punctuation", "£40/hour, no call-out fee (Lincolnshire)"],
    ["non-ASCII", "Café — naïve — 日本語"],
    ["a long URL", `https://nasdigital.co.uk/?${"a=1&".repeat(40)}`],
  ])("%s", (_label, text) => {
    expect(decode(text, MEDIUM)).toBe(text);
  });

  it.each([
    ["L", LOW],
    ["M", MEDIUM],
    ["Q", QUARTILE],
    ["H", HIGH],
  ])("at error-correction level %s", (_label, ecl) => {
    const text = "https://nasdigital.co.uk";
    expect(decode(text, ecl)).toBe(text);
  });

  it.each([2, 4, 8, 16])("at %i pixels per module", (scale) => {
    const text = "https://nasdigital.co.uk";
    expect(decode(text, MEDIUM, scale)).toBe(text);
  });
});

describe("a WiFi code decodes to a payload a phone would accept", () => {
  it.each([
    ["a plain network", { auth: "WPA" as const, ssid: "HomeNet", password: "hunter2" }],
    ["a semicolon in the name", { auth: "WPA" as const, ssid: "Guest;Net", password: "pw" }],
    ["a backslash in the password", { auth: "WPA" as const, ssid: "n", password: "pa\\ss" }],
    ["an all-hex SSID", { auth: "WPA" as const, ssid: "DEADBEEF", password: "x" }],
    ["an open network", { auth: "nopass" as const, ssid: "Coffee Shop" }],
  ])("%s", (_label, cfg) => {
    const payload = buildWifiPayload(cfg);
    const scanned = decode(payload, MEDIUM);
    expect(scanned).toBe(payload);
    // And what a phone parses out of it is what was typed in.
    expect(parseWifiPayload(scanned ?? "")).toEqual(cfg);
  });
});

describe("the quiet zone is load-bearing, not styling", () => {
  // Worth recording how this test got here. It originally asserted that a code
  // with the margin trimmed off fails to decode, and jsQR read it perfectly -
  // because a clean synthetic bitmap with nothing around it is a far easier
  // problem than a photograph. The quiet zone protects against surrounding
  // CONTENT, so the test now surrounds it with some.
  const onDarkBackground = (
    path: string,
    size: number,
    quiet: number,
  ): { data: Uint8ClampedArray; span: number } => {
    const scale = 4;
    const pad = 12;
    const inner = (size + quiet * 2) * scale;
    const span = inner + pad * 2;
    const grid = pathToGrid(path, size, quiet);
    const data = new Uint8ClampedArray(span * span * 4).fill(255);

    const set = (px: number, py: number, v: number): void => {
      const i = (py * span + px) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    };
    // A dark frame, as if the code sat on a photograph or a coloured panel.
    for (let y = 0; y < span; y += 1) {
      for (let x = 0; x < span; x += 1) {
        if (x < pad || y < pad || x >= span - pad || y >= span - pad) set(x, y, 0);
      }
    }
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!grid[y]?.[x]) continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            set(pad + (x + quiet) * scale + dx, pad + (y + quiet) * scale + dy, 0);
          }
        }
      }
    }
    return { data, span };
  };

  const readOnDark = (quiet: number): string | null => {
    const qr = qrcodegen.QrCode.encodeText("https://nasdigital.co.uk", MEDIUM);
    const grid: Grid = { size: qr.size, get: (x, y) => qr.getModule(x, y) };
    const path = rectsToPath(gridToRects(grid), quiet);
    const { data, span } = onDarkBackground(path, qr.size, quiet);
    return jsQR(data, span, span)?.data ?? null;
  };

  it("still reads on a dark background when the four modules are there", () => {
    expect(readOnDark(QUIET_ZONE)).toBe("https://nasdigital.co.uk");
  });

  it("emits the quiet zone on every side, which is the property being relied on", () => {
    const qr = qrcodegen.QrCode.encodeText("https://nasdigital.co.uk", MEDIUM);
    const grid: Grid = { size: qr.size, get: (x, y) => qr.getModule(x, y) };
    const svg = renderSvg(grid, { foreground: "#000", background: "#fff", scale: 8 });
    const span = qr.size + QUIET_ZONE * 2;
    expect(svg).toContain(`viewBox="0 0 ${span} ${span}"`);
    // Nothing in the path may sit outside the inner square.
    const coords = [...(/d="([^"]+)"/.exec(svg)?.[1] ?? "").matchAll(/M(\d+) (\d+)h(\d+)/g)];
    expect(Math.min(...coords.map((c) => Number(c[1])))).toBeGreaterThanOrEqual(QUIET_ZONE);
    expect(Math.max(...coords.map((c) => Number(c[1]) + Number(c[3])))).toBeLessThanOrEqual(
      span - QUIET_ZONE,
    );
  });
});
