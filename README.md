# nasdigital-qr-code-generator

Type a link, get a QR code, download it as an SVG a printer will be happy with — or as a PNG. Also
does WiFi join codes. Everything happens in the browser and the text never leaves your device.

Built for [nasdigital.co.uk](https://nasdigital.co.uk) as a drop-in artefact: one IIFE, one
stylesheet, and a demo page.

## The one that makes it different: it never sees your link

A QR code is a link, and a link says something — where your shop is, what your WiFi password is,
which document you are handing round. Plenty of free generators build the code **server-side**, so
the URL passes through somebody else's machine, and a documented few quietly redirect through a
tracking domain so they can count the scans.

This one has nowhere to send it. `npm run smoke` asserts there is no `fetch`, `XMLHttpRequest`,
`WebSocket`, `sendBeacon` or `EventSource` in the built bundle, and no external URL in it at all
except the SVG namespace — which is an identifier, not a resource.

## Two ways a code fails, and only one of them is obvious

**Contrast** is the obvious one. **Inversion** is not: light modules on a dark background fail on a
meaningful share of scanners *even at 21:1*, because many decoders only ever look for dark-on-light
and never try it the other way round. That is the "looks perfect, will not scan" bug, and no amount
of contrast fixes it. Both are checked; the warning says which.

The **quiet zone** is the third, and it is not adjustable. Four modules of margin is part of the
specification rather than styling, and a code with it trimmed off looks tidier and does not work.

## The error-correction level you pick is a floor

`encodeSegments` raises the level when it can do so without growing the code, so what you asked for
is a minimum. The figure under the preview is the level **actually used** — reporting the requested
one would just be wrong, and it is a one-line difference between the two.

## WiFi escaping, and the one that fails silently

Inside a `WIFI:` payload, `\`, `;`, `,`, `:` and `"` each need a backslash. They fail differently:

- Miss the **semicolon** and the SSID is truncated at it — at least that fails loudly.
- Miss the **backslash** and a password of `pa\ssword` emits `P:pa\ssword;`, which a parser reads as
  an escaped `s` and hands back `password`. **The code scans, the phone connects, authentication
  fails, and the person blames your tool.**
- A value that is **entirely hex digits** must be quoted, or a parser decodes it as raw bytes. Not a
  contrivance: a raw WPA PSK is 64 hex characters, and plenty of SSIDs are things like `1234`.
- An open network emits **no `P:` field at all** — `P:;` makes some Android builds attempt a blank
  PSK instead of an open join.

There is a golden row per character *and* a build/parse round trip over thirteen nasty inputs,
because the golden rows catch a round trip that is symmetrically wrong in both directions, and the
round trip catches the rule nobody thought to write a row for.

## Does it actually scan?

Every other test here checks the rendering is faithful to what the library produced.
`test/decode.test.ts` checks the whole thing comes back out of an **independent decoder** as the text
that went in — across seven kinds of content, all four error-correction levels, and four sizes, plus
every WiFi case. Pixels are built from the rendered path rather than the library's own grid, so a
transposed axis, a lost quiet zone or an off-by-one in the run-length merge all fail it.

⚠️ **Recorded because it corrects an assumption:** that file originally asserted a code with the
quiet zone removed *fails* to decode. It does not — jsQR read it perfectly, because a clean synthetic
bitmap with nothing around it is a far easier problem than a photograph. The quiet zone protects
against surrounding **content**, so the test now puts some there.

## SVG that a printer will accept

Coordinates stay in module units and all scaling happens in the `viewBox`, so the path data is
integers only — no float formatting, no locale, no precision setting. One `<path>`, no `<image>`,
byte-stable output. Adjacent dark modules are merged into runs, so a full row of 21 is one rect
rather than 21.

The PNG is drawn module by module with `fillRect` rather than by rasterising the SVG. No
canvas-tainting question, and exact integer pixel control — a scaled SVG rasterises with half-pixel
blur along every module edge, which costs scanability rather than just looking soft.

## Integration

Copy `dist/qr-code-generator.js` and `dist/qr-code-generator.css` into the site's assets. Plain IIFE;
does nothing unless the page contains `[data-qr]`. The markup lives in the page and the bundle finds
it.

| Attribute | On | Purpose |
|---|---|---|
| `data-qr` | the root `<section>` | Mount point |
| `data-qr-mode` | `<button>` | Value `text` or `wifi` |
| `data-qr-panel` | a wrapper | Value `text` or `wifi`; toggled with `hidden` |
| `data-qr-text` | `<textarea>` | The link or text |
| `data-qr-ssid` / `-password` / `-auth` / `-hidden` | inputs | WiFi fields |
| `data-qr-ecc` / `-size` | `<select>` | `L`/`M`/`Q`/`H`, and pixels per module |
| `data-qr-fg` / `-bg` | `<input type="color">` | Colours |
| `data-qr-preview` | a `<div>` | Where the SVG is placed |
| `data-qr-meta` | a `<p>` | Module count and the level actually used |
| `data-qr-warning` | a `<p>` | Scannability |
| `data-qr-status` | `<p role="status">` | The only live region |
| `data-qr-download-svg` / `-png` / `data-qr-copy` | `<button>` | Output |

Don't put `data-reveal` on anything the tool writes into: nasdigital's `fx.js` snapshots those once
at load, so an element injected afterwards stays at `opacity: 0` forever.

## Third-party code

The QR encoder is Project Nayuki's, MIT, **vendored rather than installed** — there is no official
npm publication, and the registry names are an unrelated package and a third-party republish. For a
library that decides whether a printed code scans, reading the author's own source is worth more
than saving a dependency line. See [THIRD-PARTY.md](THIRD-PARTY.md) for the two marked additions and
why the licence notice had to be moved into the bundle's banner.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 78 tests
npm run smoke   # 19 assertions against the built bundle
npm run demo    # serves demo/ on http://127.0.0.1:4182
```

The most valuable single test is the asymmetric 3×3 grid. `getModule(x, y)` is column-then-row and
very easy to read backwards; a transposed code renders beautifully and will not scan, and a
symmetric fixture cannot catch it.

`jsqr` is a dev dependency and is used only by the decode tests. It never reaches the bundle.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core) for `mount` and
`copyText`, and the colour maths is lifted from `withnate-contrast-checker` rather than re-derived —
the sRGB linearisation threshold is a classic thing to get subtly wrong by hand.

## Licence

MIT. See [LICENSE](LICENSE).
