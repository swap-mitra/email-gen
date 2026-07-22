import { describe, expect, it, vi } from "vitest";
import { assertPublicHttpUrl, UnsafeUrlError } from "@/lib/ingestion/url-safety";

vi.mock("node:dns", () => {
  const promises = { lookup: vi.fn() };
  return { promises, default: { promises } };
});

describe("P4 Ingestion — assertPublicHttpUrl (SSRF guard)", () => {
  it("rejects a malformed URL", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl("ftp://example.com/file")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects localhost and *.localhost hostnames", async () => {
    await expect(assertPublicHttpUrl("http://localhost:8080/admin")).rejects.toThrow(
      UnsafeUrlError,
    );
    await expect(assertPublicHttpUrl("http://foo.localhost/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects loopback and link-local IPv4 literals, including the cloud metadata endpoint", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/")).rejects.toThrow(UnsafeUrlError);
    await expect(
      assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects RFC1918 private IPv4 ranges", async () => {
    await expect(assertPublicHttpUrl("http://10.0.0.5/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl("http://172.16.0.1/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl("http://192.168.1.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects loopback and link-local IPv6 literals", async () => {
    await expect(assertPublicHttpUrl("http://[::1]/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl("http://[fe80::1]/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl("http://[fc00::1]/")).rejects.toThrow(UnsafeUrlError);
  });

  it("accepts a public IPv4 literal", async () => {
    await expect(assertPublicHttpUrl("http://8.8.8.8/")).resolves.toBeUndefined();
  });

  it("rejects a hostname that resolves to a private address", async () => {
    const dns = await import("node:dns");
    vi.mocked(dns.promises.lookup).mockResolvedValueOnce([
      { address: "169.254.169.254", family: 4 },
    ] as never);

    await expect(assertPublicHttpUrl("https://sneaky.example.com/")).rejects.toThrow(
      UnsafeUrlError,
    );
  });

  it("rejects a hostname that fails to resolve", async () => {
    const dns = await import("node:dns");
    vi.mocked(dns.promises.lookup).mockRejectedValueOnce(new Error("ENOTFOUND"));

    await expect(assertPublicHttpUrl("https://does-not-exist.invalid/")).rejects.toThrow(
      UnsafeUrlError,
    );
  });

  it("accepts a hostname that resolves to a public address", async () => {
    const dns = await import("node:dns");
    vi.mocked(dns.promises.lookup).mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ] as never);

    await expect(assertPublicHttpUrl("https://example.com/careers")).resolves.toBeUndefined();
  });
});
