import { promises as dns } from "node:dns";
import net from "node:net";

/** Thrown when a user-supplied URL resolves to a non-public network address. */
export class UnsafeUrlError extends Error {}

const BLOCKED_HOSTNAMES = new Set(["localhost"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — includes cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
  if (lower.startsWith("::ffff:")) {
    const embedded = lower.slice("::ffff:".length);
    if (net.isIPv4(embedded) && isPrivateIPv4(embedded)) return true;
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  return net.isIP(ip) === 4 ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

/**
 * Blocks SSRF: rejects any URL whose scheme isn't http(s) or whose host
 * resolves to a loopback/link-local/RFC1918 address (including the
 * 169.254.169.254 cloud metadata endpoint most SSRF exploits target).
 * Ingestion fetches user-submitted URLs server-side, so this must run
 * immediately before every outbound request, not just once at submission —
 * callers should re-check on every redirect hop too.
 *
 * ponytail: resolves the hostname, then hands the *hostname* to fetch, which
 * resolves it again — an attacker-controlled resolver can answer public here
 * and private there (DNS rebinding). Re-checking each hop doesn't close that;
 * only connecting to the address validated here does, which needs a custom
 * agent/socket rather than plain fetch. Upgrade if untrusted URLs ever matter
 * more than they do at one-per-opportunity.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("The source URL is not valid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are supported.");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError("This URL points to a local address and cannot be ingested.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeUrlError(
        "This URL points to a private network address and cannot be ingested.",
      );
    }
    return;
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((result) => result.address);
  } catch {
    throw new UnsafeUrlError("The source URL's host could not be resolved.");
  }

  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new UnsafeUrlError(
      "This URL resolves to a private network address and cannot be ingested.",
    );
  }
}
