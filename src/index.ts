/**
 * The DOM half: read the controls, encode, draw, offer the two downloads.
 *
 * The PNG is drawn module by module with fillRect rather than by rasterising
 * the SVG. It avoids the canvas-tainting question entirely, and it gives exact
 * integer pixel control - a scaled SVG rasterises with half-pixel blur along
 * every module edge, which is a real cost to scanability rather than a
 * cosmetic one.
 */

import { copyText, mount } from "@nasdigitaluk/withnate-tool-core";
import { parseColour, type Rgb } from "./colour.js";
import { describeScan, scannability } from "./scan.js";
import { QUIET_ZONE, gridToRects, renderSvg, type Grid } from "./svg.js";
import { qrcodegen } from "./vendor/qrcodegen.js";
import { buildWifiPayload, type WifiAuth } from "./wifi.js";

const ECC = {
  L: qrcodegen.QrCode.Ecc.LOW,
  M: qrcodegen.QrCode.Ecc.MEDIUM,
  Q: qrcodegen.QrCode.Ecc.QUARTILE,
  H: qrcodegen.QrCode.Ecc.HIGH,
} as const;

const ECC_NAME: Record<number, string> = { 0: "L", 1: "M", 2: "Q", 3: "H" };

const DEBOUNCE_MS = 150;

const download = (() => {
  let previous: string | null = null;
  return (blob: Blob, filename: string): void => {
    if (previous) URL.revokeObjectURL(previous);
    previous = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = previous;
    a.download = filename;
    a.click();
  };
})();

mount("[data-qr]", ({ root }) => {
  const preview = root.querySelector<HTMLElement>("[data-qr-preview]");
  const textField = root.querySelector<HTMLTextAreaElement>("[data-qr-text]");
  if (!preview || !textField) return;

  const q = <T extends Element>(sel: string): T | null => root.querySelector<T>(sel);
  const ssid = q<HTMLInputElement>("[data-qr-ssid]");
  const password = q<HTMLInputElement>("[data-qr-password]");
  const auth = q<HTMLSelectElement>("[data-qr-auth]");
  const hidden = q<HTMLInputElement>("[data-qr-hidden]");
  const eccSelect = q<HTMLSelectElement>("[data-qr-ecc]");
  const sizeSelect = q<HTMLSelectElement>("[data-qr-size]");
  const fgInput = q<HTMLInputElement>("[data-qr-fg]");
  const bgInput = q<HTMLInputElement>("[data-qr-bg]");
  const warning = q<HTMLElement>("[data-qr-warning]");
  const meta = q<HTMLElement>("[data-qr-meta]");
  const status = q<HTMLElement>("[data-qr-status]");
  const svgButton = q<HTMLButtonElement>("[data-qr-download-svg]");
  const pngButton = q<HTMLButtonElement>("[data-qr-download-png]");
  const copyButton = q<HTMLButtonElement>("[data-qr-copy]");
  const modes = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-qr-mode]"));
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-qr-panel]"));

  let mode: "text" | "wifi" = "text";
  let current: { svg: string; grid: Grid; fg: Rgb; bg: Rgb } | null = null;
  let timer: number | undefined;

  const payload = (): string => {
    if (mode === "wifi") {
      const name = ssid?.value ?? "";
      if (name.trim() === "") return "";
      const chosen = (auth?.value ?? "WPA") as WifiAuth;
      const cfg = {
        auth: chosen,
        ssid: name,
        ...(chosen !== "nopass" && password?.value ? { password: password.value } : {}),
        ...(hidden?.checked ? { hidden: true } : {}),
      };
      return buildWifiPayload(cfg);
    }
    return textField.value;
  };

  const render = (): void => {
    const text = payload();
    const fg = parseColour(fgInput?.value ?? "#000000") ?? { r: 0, g: 0, b: 0, a: 1 };
    const bg = parseColour(bgInput?.value ?? "#ffffff") ?? { r: 255, g: 255, b: 255, a: 1 };

    const verdict = scannability(fg, bg);
    if (warning) {
      warning.textContent = describeScan(verdict);
      warning.className = `qr-warning${verdict.ok ? "" : " qr-warning-bad"}`;
    }

    if (text.trim() === "") {
      preview.textContent = "";
      current = null;
      if (meta) meta.textContent = "Type something above and the code appears here.";
      svgButton?.setAttribute("disabled", "");
      pngButton?.setAttribute("disabled", "");
      return;
    }

    let qr: qrcodegen.QrCode;
    try {
      qr = qrcodegen.QrCode.encodeText(text, ECC[(eccSelect?.value ?? "M") as keyof typeof ECC]);
    } catch {
      preview.textContent = "";
      current = null;
      if (meta) meta.textContent = "That is too much text to fit in a QR code. Shorten it and try again.";
      svgButton?.setAttribute("disabled", "");
      pngButton?.setAttribute("disabled", "");
      return;
    }

    const grid: Grid = { size: qr.size, get: (x, y) => qr.getModule(x, y) };
    const scale = Number.parseInt(sizeSelect?.value ?? "8", 10) || 8;
    const svg = renderSvg(grid, {
      foreground: fgInput?.value ?? "#000000",
      background: bgInput?.value ?? "#ffffff",
      scale,
    });

    preview.replaceChildren();
    // Parsed rather than assigned as markup: the string is built entirely by
    // renderSvg from integers and two colour values, and this keeps it that way.
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const node = doc.documentElement;
    if (node.nodeName === "svg") preview.append(document.importNode(node, true));

    current = { svg, grid, fg, bg };

    // The library raises the error-correction level when there is spare room in
    // the same version, so what was asked for is a floor. Showing the requested
    // level rather than the one actually used would simply be wrong.
    const actual = ECC_NAME[qr.errorCorrectionLevel.ordinal] ?? "?";
    const asked = eccSelect?.value ?? "M";
    if (meta) {
      meta.textContent =
        actual === asked
          ? `${qr.size} x ${qr.size} modules, error correction ${actual}.`
          : `${qr.size} x ${qr.size} modules, error correction ${actual} - you asked for ${asked}, and there was spare room so the library used more.`;
    }
    svgButton?.removeAttribute("disabled");
    pngButton?.removeAttribute("disabled");
  };

  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(render, DEBOUNCE_MS);
  };

  for (const button of modes) {
    button.addEventListener("click", () => {
      mode = button.dataset["qrMode"] === "wifi" ? "wifi" : "text";
      for (const b of modes) b.setAttribute("aria-pressed", String(b === button));
      for (const p of panels) p.hidden = p.dataset["qrPanel"] !== mode;
      render();
    });
  }

  for (const el of [textField, ssid, password]) el?.addEventListener("input", schedule);
  for (const el of [auth, hidden, eccSelect, sizeSelect]) el?.addEventListener("change", render);
  for (const el of [fgInput, bgInput]) el?.addEventListener("input", schedule);

  svgButton?.addEventListener("click", () => {
    if (!current) return;
    download(new Blob([current.svg], { type: "image/svg+xml" }), "qr-code.svg");
  });

  pngButton?.addEventListener("click", () => {
    if (!current) return;
    const scale = Number.parseInt(sizeSelect?.value ?? "8", 10) || 8;
    const span = current.grid.size + QUIET_ZONE * 2;
    const canvas = document.createElement("canvas");
    canvas.width = span * scale;
    canvas.height = span * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = bgInput?.value ?? "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fgInput?.value ?? "#000000";
    for (const r of gridToRects(current.grid)) {
      ctx.fillRect((r.x + QUIET_ZONE) * scale, (r.y + QUIET_ZONE) * scale, r.w * scale, scale);
    }
    canvas.toBlob((blob) => {
      if (blob) download(blob, "qr-code.png");
    }, "image/png");
  });

  copyButton?.addEventListener("click", () => {
    if (!current) return;
    void copyText(current.svg).then(({ ok }) => {
      if (status) {
        status.textContent = ok
          ? "SVG markup copied to the clipboard."
          : "This browser would not let the page copy it.";
      }
    });
  });

  render();
});
