# Third-party code

## QR Code generator library

- **Source:** [github.com/nayuki/QR-Code-generator](https://github.com/nayuki/QR-Code-generator), `typescript-javascript/qrcodegen.ts`
- **Copyright:** Project Nayuki
- **Licence:** MIT
- **Vendored at:** `src/vendor/qrcodegen.ts`

### Why vendored rather than installed from npm

There is no official npm publication. `qrcodegen` on the registry is an unrelated
package by a different author, and `nayuki-qr-code-generator` is a third-party
republish. For a library that decides whether a printed code scans, taking the
source from the author's own repository and reading it is worth more than saving
a `dependencies` line.

### What was changed

Two additions, both marked in the file, with nothing between them touched:

1. `// @ts-nocheck` on the first line. This repository compiles with
   `noUncheckedIndexedAccess`, which upstream does not use, so the file reports
   errors under settings its author never wrote it for. Holding vendored code to
   stricter rules than its maintainers is not our call, and editing it to satisfy
   them would be a fork.
2. `export { qrcodegen };` at the end. Upstream is a bare TypeScript namespace —
   a global script — which cannot be imported by a module.

### The licence notice

esbuild is configured with `legalComments: "none"`, which strips `/*! ... */`
blocks. Left alone that would silently delete an attribution the MIT licence
requires us to retain. The notice is reproduced in the bundle's own banner
instead, which is the one comment the bundler keeps — see `scripts/build.mjs`.
