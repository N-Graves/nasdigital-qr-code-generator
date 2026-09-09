/**
 * The WIFI: payload a phone recognises as "join this network".
 *
 * Almost all of the difficulty is escaping, and the failures are quiet in a way
 * that makes them expensive. Miss the semicolon and the SSID is truncated at it,
 * which at least fails loudly. Miss the BACKSLASH and a password of pa\ssword
 * emits P:pa\ssword;, which the parser reads as an escaped s and hands back
 * "password" - the code scans perfectly, the phone connects, authentication
 * fails, and the person blames your tool.
 *
 * The other one people miss: a value made entirely of hex digits has to be
 * quoted, or a parser decodes it as raw bytes. That is not a contrivance - a raw
 * WPA PSK is 64 hex characters, and plenty of SSIDs are things like 1234.
 */

export type WifiAuth = "WPA" | "WEP" | "nopass";

export interface WifiConfig {
  auth: WifiAuth;
  ssid: string;
  password?: string;
  hidden?: boolean;
}

const SPECIAL = new Set(["\\", ";", ",", ":", '"']);

export const escapeWifiField = (raw: string): string => {
  let out = "";
  for (const ch of raw) out += SPECIAL.has(ch) ? `\\${ch}` : ch;
  return out;
};

/** All hex digits, and long enough to be mistaken for raw bytes rather than text. */
export const needsHexQuoting = (raw: string): boolean =>
  raw.length > 0 && /^[0-9a-fA-F]+$/.test(raw);

const field = (value: string): string => {
  const escaped = escapeWifiField(value);
  return needsHexQuoting(value) ? `"${escaped}"` : escaped;
};

export const buildWifiPayload = (cfg: WifiConfig): string => {
  const parts = [`T:${cfg.auth}`, `S:${field(cfg.ssid)}`];
  // An open network must emit no P: field at all. Emitting an empty P:; makes
  // some Android builds attempt a blank PSK instead of an open join.
  if (cfg.auth !== "nopass" && cfg.password) parts.push(`P:${field(cfg.password)}`);
  if (cfg.hidden) parts.push("H:true");
  // Field terminator plus payload terminator. One semicolon is the common bug.
  return `WIFI:${parts.join(";")};;`;
};

const unescape = (raw: string): string => {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      out += raw[i + 1];
      i += 1;
    } else if (ch !== undefined) {
      out += ch;
    }
  }
  return out;
};

/**
 * Exists so build and parse can be round-tripped against each other in tests,
 * which is what catches the escaping rule nobody thought to write a row for.
 */
export const parseWifiPayload = (payload: string): WifiConfig | null => {
  if (!payload.startsWith("WIFI:")) return null;
  const body = payload.slice(5).replace(/;;$/, "");

  const found: Record<string, string> = {};
  let key: string | null = null;
  let value = "";
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "\\") {
      value += body.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === ":" && key === null) {
      key = value;
      value = "";
      i += 1;
      continue;
    }
    if (ch === ";") {
      if (key !== null) found[key] = value;
      key = null;
      value = "";
      i += 1;
      continue;
    }
    value += ch;
    i += 1;
  }
  if (key !== null) found[key] = value;

  const auth = found["T"];
  if (auth !== "WPA" && auth !== "WEP" && auth !== "nopass") return null;

  const strip = (v: string | undefined): string =>
    v === undefined ? "" : unescape(/^".*"$/.test(v) ? v.slice(1, -1) : v);

  const cfg: WifiConfig = { auth, ssid: strip(found["S"]) };
  if (found["P"] !== undefined) cfg.password = strip(found["P"]);
  if (found["H"] === "true") cfg.hidden = true;
  return cfg;
};
