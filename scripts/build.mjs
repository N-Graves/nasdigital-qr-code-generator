import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

// esbuild is configured with legalComments: "none", which strips /*! ... */
// blocks - including the MIT notice inside the vendored QR library. That
// notice is a condition of the licence, so it is reproduced here, in the one
// comment the bundler is told to keep. See THIRD-PARTY.md.
const banner = `/*! ${pkg.name} v${pkg.version} - ${pkg.license}
 * ${pkg.homepage}
 * Runs entirely in the browser. No network requests, no storage.
 *
 * Bundles the QR Code generator library, Copyright (c) Project Nayuki,
 * MIT License. https://www.nayuki.io/page/qr-code-generator-library
 */`;

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

const result = await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/qr-code-generator.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  banner: { js: banner },
  metafile: true,
});

await build({
  entryPoints: ["src/style.css"],
  outfile: "dist/qr-code-generator.css",
  bundle: true,
  minify: false,
  banner: { css: banner },
});

const out = result.metafile.outputs["dist/qr-code-generator.js"];
const css = await readFile(new URL("../dist/qr-code-generator.css", import.meta.url));

await writeFile(
  new URL("../dist/BUILD.txt", import.meta.url),
  [
    `${pkg.name} v${pkg.version}`,
    `js   ${out.bytes} bytes`,
    `css  ${css.length} bytes`,
    "",
    "Drop both into the site's assets directory and reference them from the",
    "page. The script is a plain IIFE - no module, no defer requirement beyond",
    "the site's own convention. It does nothing unless the page contains an",
    "element with a data-qr attribute.",
    "",
  ].join("\n"),
);

console.log(`built  js ${out.bytes}B  css ${css.length}B`);
