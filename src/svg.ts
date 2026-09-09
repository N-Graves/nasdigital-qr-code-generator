/**
 * Turning the module grid into SVG.
 *
 * Every coordinate stays in module units, and all the scaling happens in the
 * viewBox. That means the path data is integers only - no float formatting, no
 * locale, no precision setting - so it is byte-stable across Node versions and
 * genuinely snapshot-able. It is also better SVG: smaller, and resolution
 * independent. The testability is a side effect rather than a tax.
 */

export interface Grid {
  size: number;
  get(x: number, y: number): boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
}

/** The quiet zone is four modules and is not negotiable - see README. */
export const QUIET_ZONE = 4;

/**
 * Horizontal run-length merge. A full row of 21 dark modules becomes one rect
 * rather than 21, which is a real size and rendering win on a dense code.
 */
export const gridToRects = (grid: Grid): Rect[] => {
  const rects: Rect[] = [];
  for (let y = 0; y < grid.size; y += 1) {
    let run = 0;
    for (let x = 0; x <= grid.size; x += 1) {
      // getModule(x, y) is column-then-row. Getting this backwards produces a
      // transposed code that renders beautifully and will not scan.
      const dark = x < grid.size && grid.get(x, y);
      if (dark) {
        run += 1;
        continue;
      }
      if (run > 0) rects.push({ x: x - run, y, w: run });
      run = 0;
    }
  }
  return rects;
};

export const rectsToPath = (rects: Rect[], offset = QUIET_ZONE): string =>
  rects
    .map((r) => `M${r.x + offset} ${r.y + offset}h${r.w}v1h-${r.w}z`)
    .join("");

export interface SvgOptions {
  foreground: string;
  background: string;
  /** Pixels per module in the width/height attributes. The path stays in modules. */
  scale: number;
  quietZone?: number;
}

export const renderSvg = (grid: Grid, opts: SvgOptions): string => {
  const quiet = opts.quietZone ?? QUIET_ZONE;
  const span = grid.size + quiet * 2;
  const px = span * opts.scale;
  const path = rectsToPath(gridToRects(grid), quiet);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}"`,
    ` width="${px}" height="${px}" shape-rendering="crispEdges" role="img">`,
    `<rect width="${span}" height="${span}" fill="${opts.background}"/>`,
    `<path d="${path}" fill="${opts.foreground}"/>`,
    `</svg>`,
  ].join("");
};

/** Reads a path built by rectsToPath back into a grid, so a round trip can be asserted. */
export const pathToGrid = (path: string, size: number, offset = QUIET_ZONE): boolean[][] => {
  const grid: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const runs = path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g);
  for (const run of runs) {
    const x = Number(run[1]) - offset;
    const y = Number(run[2]) - offset;
    const w = Number(run[3]);
    for (let i = 0; i < w; i += 1) {
      const row = grid[y];
      if (row && x + i >= 0 && x + i < size) row[x + i] = true;
    }
  }
  return grid;
};
