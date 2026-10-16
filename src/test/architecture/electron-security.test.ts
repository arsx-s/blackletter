import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { safeExternalUrl, isTrustedRendererUrl } = require("../../../electron/security.cjs") as {
  safeExternalUrl: (value: unknown) => string | null;
  isTrustedRendererUrl: (value: string, options: { isDev: boolean; appRoot: string }) => boolean;
};

describe("Electron navigation boundary", () => {
  it("permits only bounded HTTP(S) URLs without embedded credentials", () => {
    expect(safeExternalUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull();
    expect(safeExternalUrl("https://user:pass@example.com")).toBeNull();
    expect(safeExternalUrl(`https://example.com/${"a".repeat(2048)}`)).toBeNull();
  });

  it("limits development navigation to the Vite loopback origins", () => {
    const options = { isDev: true, appRoot: process.cwd() };
    expect(isTrustedRendererUrl("http://localhost:5173/", options)).toBe(true);
    expect(isTrustedRendererUrl("http://127.0.0.1:5173/", options)).toBe(true);
    expect(isTrustedRendererUrl("https://evil.example/", options)).toBe(false);
    expect(isTrustedRendererUrl("http://localhost:5173.evil.example/", options)).toBe(false);
  });

  it("limits packaged navigation to the exact local app document", () => {
    const appRoot = path.resolve("C:/blackletter-test");
    const options = { isDev: false, appRoot };
    const expected = require("node:url").pathToFileURL(path.join(appRoot, "dist", "index.html")).href;
    expect(isTrustedRendererUrl(expected, options)).toBe(true);
    expect(isTrustedRendererUrl(`${expected}?next=https://evil.example`, options)).toBe(false);
    expect(isTrustedRendererUrl("https://evil.example/", options)).toBe(false);
  });
});
