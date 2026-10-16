import { describe, expect, it } from "vitest";
import { checkResearchUrl, isPrivateHost, isPrivateIpv4, isPrivateIpv6 } from "../../research/web";
import { defaultResearchPolicy } from "../../research/web";

/**
 * The fetch guard is the boundary that keeps a "research" feature from becoming
 * a port scanner. These tests are written as attacks: metadata services, private
 * ranges, credential smuggling, host allowlist escape.
 */

const policy = (overrides: Partial<Parameters<typeof defaultResearchPolicy>[0]> = {}) =>
  defaultResearchPolicy({ allowedHosts: ["example.gov"], ...overrides });

describe("private and reserved addresses", () => {
  it("flags loopback, private, link-local, CGNAT and reserved IPv4", () => {
    for (const host of [
      "127.0.0.1",
      "127.9.9.9",
      "0.0.0.0",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "192.0.0.1",
      "198.18.0.1",
      "198.51.100.7",
      "203.0.113.7",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateIpv4(host), host).toBe(true);
    }
    for (const host of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "11.0.0.1"]) {
      expect(isPrivateIpv4(host), host).toBe(false);
    }
  });

  it("flags loopback, unique-local, link-local and mapped-private IPv6", () => {
    for (const host of ["::1", "::", "fc00::1", "fd00:1234::1", "fe80::1", "2001:db8::1", "::ffff:192.168.0.1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIpv6(host), host).toBe(true);
    }
    expect(isPrivateIpv6("2001:4860:4860::8888")).toBe(false);
  });

  it("flags local hostnames and single-label names", () => {
    for (const host of ["localhost", "foo.localhost", "printer.local", "wiki.internal", "router", "metadata.google.internal", "example.home.arpa"]) {
      expect(isPrivateHost(host), host).toBe(true);
    }
    expect(isPrivateHost("example.gov")).toBe(false);
  });
});

describe("url policy", () => {
  it("accepts an approved https host and drops the fragment", () => {
    const verdict = checkResearchUrl("https://example.gov/report#section-3", policy());
    expect(verdict.ok).toBe(true);
    expect(verdict.url).toBe("https://example.gov/report");
  });

  it("refuses every scheme that is not http or https", () => {
    for (const url of ["file:///etc/passwd", "data:text/html,<h1>x</h1>", "javascript:alert(1)", "ftp://example.gov/x", "chrome://settings"]) {
      const verdict = checkResearchUrl(url, policy());
      expect(verdict.ok, url).toBe(false);
      expect(verdict.code, url).toBe("scheme");
    }
  });

  it("refuses credentials in the url rather than sending them", () => {
    const verdict = checkResearchUrl("https://user:secret@example.gov/report", policy());
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("credentials");
  });

  it("refuses plain http unless it is allowed explicitly", () => {
    expect(checkResearchUrl("http://example.gov/report", policy()).code).toBe("insecure");
    expect(checkResearchUrl("http://example.gov/report", defaultResearchPolicy({ allowedHosts: ["example.gov"], allowHttp: true })).ok).toBe(true);
  });

  it("refuses a private address even when the host allowlist would allow it", () => {
    const verdict = checkResearchUrl("http://169.254.169.254/latest/meta-data/", defaultResearchPolicy({ allowedHosts: ["169.254.169.254"], allowHttp: true }));
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("private-address");
  });

  it("refuses a host that is not approved, and says nothing is approved when the list is empty", () => {
    const notApproved = checkResearchUrl("https://evil.example.net/x", policy());
    expect(notApproved.code).toBe("host-not-approved");

    const nothingApproved = checkResearchUrl("https://example.gov/x", defaultResearchPolicy());
    expect(nothingApproved.code).toBe("host-not-approved");
    expect(nothingApproved.reason).toContain("no host is approved for this run");
  });

  it("does not let a lookalike host escape the allowlist", () => {
    for (const url of ["https://example.gov.evil.net/x", "https://notexample.gov/x", "https://example.gov@evil.net/x"]) {
      const verdict = checkResearchUrl(url, policy());
      expect(verdict.ok, url).toBe(false);
    }
  });

  it("allows a subdomain of an approved host", () => {
    expect(checkResearchUrl("https://data.example.gov/set", policy()).ok).toBe(true);
  });

  it("refuses unreadable and absurdly long urls", () => {
    expect(checkResearchUrl("", policy()).code).toBe("bad-url");
    expect(checkResearchUrl("not a url", policy()).code).toBe("bad-url");
    expect(checkResearchUrl(`https://example.gov/${"x".repeat(3000)}`, policy()).code).toBe("bad-url");
  });
});
