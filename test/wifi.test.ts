import { describe, expect, it } from "vitest";
import {
  buildWifiPayload,
  escapeWifiField,
  needsHexQuoting,
  parseWifiPayload,
  type WifiConfig,
} from "../src/wifi.js";

describe("escapeWifiField", () => {
  // One row per character, because each one fails differently and the backslash
  // one fails silently - the code scans, the phone connects, auth fails.
  it.each([
    [";", "My;Net", "My\\;Net"],
    ["backslash", "pa\\ss", "pa\\\\ss"],
    [",", "a,b", "a\\,b"],
    [":", "a:b", "a\\:b"],
    ['"', 'say"hi', 'say\\"hi'],
  ])("escapes %s", (_label, raw, expected) => {
    expect(escapeWifiField(raw)).toBe(expected);
  });

  it("escapes all five at once", () => {
    expect(escapeWifiField('\\;,:"')).toBe('\\\\\\;\\,\\:\\"');
  });

  it("leaves ordinary text and non-ASCII alone", () => {
    expect(escapeWifiField("Café 📶 network")).toBe("Café 📶 network");
  });
});

describe("needsHexQuoting", () => {
  // A 64-hex-character password is a real raw PSK, not a contrivance, and an
  // SSID of 1234 is common. Unquoted, a parser decodes either as raw bytes.
  it.each(["DEADBEEF", "1234", "a".repeat(64), "0"])("quotes the all-hex value %s", (v) => {
    expect(needsHexQuoting(v)).toBe(true);
  });

  it.each(["DEADBEEG", "hello", "12 34", "", "12-34"])("leaves %s alone", (v) => {
    expect(needsHexQuoting(v)).toBe(false);
  });
});

describe("buildWifiPayload, exact output", () => {
  it.each([
    [
      "a plain WPA network",
      { auth: "WPA", ssid: "HomeNet", password: "hunter2" } as WifiConfig,
      "WIFI:T:WPA;S:HomeNet;P:hunter2;;",
    ],
    [
      "a semicolon in the SSID",
      { auth: "WPA", ssid: "My;Net", password: "pw" } as WifiConfig,
      "WIFI:T:WPA;S:My\\;Net;P:pw;;",
    ],
    [
      "a backslash in the password",
      { auth: "WPA", ssid: "n", password: "pa\\ss" } as WifiConfig,
      "WIFI:T:WPA;S:n;P:pa\\\\ss;;",
    ],
    [
      "an all-hex SSID",
      { auth: "WPA", ssid: "DEADBEEF", password: "x" } as WifiConfig,
      'WIFI:T:WPA;S:"DEADBEEF";P:x;;',
    ],
    [
      "a hidden network",
      { auth: "WPA", ssid: "n", password: "p", hidden: true } as WifiConfig,
      "WIFI:T:WPA;S:n;P:p;H:true;;",
    ],
  ])("%s", (_label, cfg, expected) => {
    expect(buildWifiPayload(cfg)).toBe(expected);
  });

  // Emitting P:; makes some Android builds attempt a blank PSK instead of an
  // open join, so the field has to be absent rather than empty.
  it("emits no P field at all for an open network", () => {
    const payload = buildWifiPayload({ auth: "nopass", ssid: "Guest" });
    expect(payload).toBe("WIFI:T:nopass;S:Guest;;");
    expect(payload).not.toContain("P:");
  });

  it("drops the password even if one is passed for an open network", () => {
    expect(buildWifiPayload({ auth: "nopass", ssid: "Guest", password: "ignored" })).not.toContain(
      "ignored",
    );
  });

  // Field terminator plus payload terminator. One semicolon is the common bug.
  it("always ends with two semicolons", () => {
    expect(buildWifiPayload({ auth: "WPA", ssid: "a", password: "b" }).endsWith(";;")).toBe(true);
  });
});

describe("build and parse round-trip", () => {
  // The golden rows above catch a round trip that is symmetrically wrong in both
  // directions. This catches the escaping rule nobody thought to write a row for.
  const nasty: WifiConfig[] = [
    { auth: "WPA", ssid: "plain", password: "plain" },
    { auth: "WPA", ssid: "semi;colon", password: "back\\slash" },
    { auth: "WPA", ssid: "com,ma", password: "co:lon" },
    { auth: "WPA", ssid: 'quo"te', password: 'both"\\' },
    { auth: "WPA", ssid: '\\;,:"', password: '\\;,:"' },
    { auth: "WPA", ssid: ";;", password: "x" },
    { auth: "WPA", ssid: "\\", password: "\\" },
    { auth: "WPA", ssid: "DEADBEEF", password: "CAFEBABE" },
    { auth: "WPA", ssid: "Café 📶", password: "pässwörd" },
    { auth: "WPA", ssid: "n", password: `${"a".repeat(62)}\\` },
    { auth: "nopass", ssid: "Guest" },
    { auth: "WEP", ssid: "old", password: "1234567890" },
    { auth: "WPA", ssid: "hidden", password: "p", hidden: true },
  ];

  it.each(nasty.map((c, i) => [i, c] as const))("survives a round trip: case %i", (_i, cfg) => {
    expect(parseWifiPayload(buildWifiPayload(cfg))).toEqual(cfg);
  });
});

describe("parseWifiPayload refusals", () => {
  it.each(["", "hello", "HTTP://example.com", "WIFI:T:WPA2;S:x;;"])("returns null for %s", (s) => {
    expect(parseWifiPayload(s)).toBeNull();
  });
});
