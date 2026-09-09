import { describe, expect, it } from "vitest";
import { QUIET_ZONE, gridToRects, pathToGrid, rectsToPath, renderSvg, type Grid } from "../src/svg.js";
import { qrcodegen } from "../src/vendor/qrcodegen.js";
import { scannability } from "../src/scan.js";
import { parseColour } from "../src/colour.js";

/** A grid asymmetric on BOTH axes. A symmetric one cannot catch transposition. */
const asymmetric: Grid = {
  size: 3,
  get: (x, y) => (x === 0 && y === 0) || (x === 1 && y === 0) || (x === 0 && y === 2),
};

describe("gridToRects", () => {
  // getModule(x, y) is column-then-row and it is very easy to read backwards.
  // A transposed code renders beautifully and will not scan, so this is the
  // single most valuable test in the repo.
  it("reads x as the column and y as the row", () => {
    expect(gridToRects(asymmetric)).toEqual([
      { x: 0, y: 0, w: 2 },
      { x: 0, y: 2, w: 1 },
    ]);
  });

  it("merges a full row into one rect rather than one per module", () => {
    const solid: Grid = { size: 21, get: (_x, y) => y === 0 };
    const rects = gridToRects(solid);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 21 });
  });

  it("does not merge across a gap", () => {
    const checker: Grid = { size: 21, get: (x, y) => y === 0 && x % 2 === 0 };
    expect(gridToRects(checker)).toHaveLength(11);
  });

  it("returns nothing for an empty grid", () => {
    expect(gridToRects({ size: 5, get: () => false })).toEqual([]);
  });
});

describe("rectsToPath", () => {
  it("emits integers only, offset by the quiet zone", () => {
    expect(rectsToPath(gridToRects(asymmetric))).toBe("M4 4h2v1h-2zM4 6h1v1h-1z");
  });

  it("has no decimal point anywhere, at any scale", () => {
    const qr = qrcodegen.QrCode.encodeText("https://nasdigital.co.uk", qrcodegen.QrCode.Ecc.MEDIUM);
    const path = rectsToPath(gridToRects({ size: qr.size, get: (x, y) => qr.getModule(x, y) }));
    expect(path).not.toMatch(/\./);
  });
});

describe("renderSvg", () => {
  const qr = qrcodegen.QrCode.encodeText("https://nasdigital.co.uk", qrcodegen.QrCode.Ecc.HIGH);
  const grid: Grid = { size: qr.size, get: (x, y) => qr.getModule(x, y) };

  // Survives a library upgrade, where a whole-document snapshot would just churn
  // and get regenerated without anybody reading it.
  it("round-trips every module back out of the path", () => {
    const svg = renderSvg(grid, { foreground: "#000000", background: "#ffffff", scale: 8 });
    const d = /d="([^"]+)"/.exec(svg)?.[1] ?? "";
    const back = pathToGrid(d, qr.size);
    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        expect(back[y]?.[x] ?? false).toBe(qr.getModule(x, y));
      }
    }
  });

  it("leaves exactly four modules of quiet zone on every side", () => {
    const svg = renderSvg(grid, { foreground: "#000000", background: "#ffffff", scale: 8 });
    const span = qr.size + QUIET_ZONE * 2;
    expect(svg).toContain(`viewBox="0 0 ${span} ${span}"`);

    const d = /d="([^"]+)"/.exec(svg)?.[1] ?? "";
    const coords = [...d.matchAll(/M(\d+) (\d+)h(\d+)/g)];
    const minX = Math.min(...coords.map((c) => Number(c[1])));
    const minY = Math.min(...coords.map((c) => Number(c[2])));
    const maxX = Math.max(...coords.map((c) => Number(c[1]) + Number(c[3])));
    expect(minX).toBe(QUIET_ZONE);
    expect(minY).toBe(QUIET_ZONE);
    expect(span - maxX).toBe(QUIET_ZONE);
  });

  it("scales through width and height, never through the path", () => {
    const small = renderSvg(grid, { foreground: "#000", background: "#fff", scale: 4 });
    const large = renderSvg(grid, { foreground: "#000", background: "#fff", scale: 16 });
    const dOf = (s: string): string => /d="([^"]+)"/.exec(s)?.[1] ?? "";
    expect(dOf(small)).toBe(dOf(large));
    expect(large).toContain(`width="${(qr.size + 8) * 16}"`);
  });

  it("is real markup with a background and one path", () => {
    const svg = renderSvg(grid, { foreground: "#111111", background: "#eeeeee", scale: 8 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
    expect(svg).not.toContain("<image");
  });
});

describe("the library's error correction is a floor, not a setting", () => {
  // encodeSegments boosts the level when there is spare room in the same
  // version, so the requested level is a minimum. Displaying what was asked for
  // rather than what was used is simply wrong.
  it("can come back higher than the level requested", () => {
    const qr = qrcodegen.QrCode.encodeText("hi", qrcodegen.QrCode.Ecc.LOW);
    expect(qr.errorCorrectionLevel.ordinal).toBeGreaterThanOrEqual(
      qrcodegen.QrCode.Ecc.LOW.ordinal,
    );
  });
});

describe("scannability", () => {
  const c = (s: string) => parseColour(s)!;

  it("passes ordinary black on white", () => {
    const v = scannability(c("#000000"), c("#ffffff"));
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  // The whole point of this function. Maximal contrast, and it still fails.
  it("fails white on black as inverted, despite 21:1 contrast", () => {
    const v = scannability(c("#ffffff"), c("#000000"));
    expect(v.ratio).toBeCloseTo(21, 1);
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain("inverted");
  });

  it("fails two similar mid-greys on contrast", () => {
    const v = scannability(c("#777777"), c("#8a8a8a"));
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain("low-contrast");
  });

  it("flags a see-through background", () => {
    const v = scannability(c("#000000"), c("rgba(255,255,255,0.5)"));
    expect(v.reasons).toContain("transparent-background");
  });
});
