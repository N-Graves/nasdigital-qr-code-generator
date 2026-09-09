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
