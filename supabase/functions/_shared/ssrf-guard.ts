/**
 * SSRF guard for server-side outbound HTTP requests where the target URL is
 * derived (even partially) from user input.
 *
 * Defense layers:
 *   1. Scheme allowlist (https only by default)
 *   2. Hostname must be a public DNS name (no IPs in URL)
 *   3. DNS resolution check — every resolved IP must NOT be:
 *        - loopback / unspecified
 *        - link-local
 *        - RFC1918 private
 *        - cloud metadata (169.254.169.254, fd00:ec2::254)
 *        - shared-address space (100.64.0.0/10)
 *   4. Optional host allowlist (caller passes the user's connected sites)
 *   5. No redirect following — caller must opt-in explicitly
 *   6. Hard size + timeout caps
 *
 * Usage:
 *   const guarded = await safeFetch(url, {
 *     allowedHosts: ['example.com'],
 *     maxBytes: 256 * 1024,
 *     timeoutMs: 10_000,
 *   });
 *
 * On any guard failure, throws an Error with a user-safe message; never
 * returns the unsafe Response.
 */

const PRIVATE_V4_RANGES: Array<[string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10], // CGNAT
  ["0.0.0.0", 8],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],   // multicast
  ["240.0.0.0", 4],   // reserved
];

const BLOCKED_V6_PREFIXES = [
  "::1",            // loopback
  "::",             // unspecified
  "fc00",           // ULA
  "fd00",           // ULA
  "fe80",           // link-local
  "ff00",           // multicast
  "::ffff:",        // v4-mapped — re-check as v4 below
  "fd00:ec2::254",  // EC2 IMDSv6
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = (n << 8) >>> 0 | x;
    n = n >>> 0;
  }
  return n >>> 0;
}

function isPrivateV4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true; // unparseable → treat as unsafe
  for (const [base, bits] of PRIVATE_V4_RANGES) {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if (((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0)) return true;
  }
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  for (const p of BLOCKED_V6_PREFIXES) {
    if (lower === p || lower.startsWith(p)) return true;
  }
  // v4-mapped → extract embedded v4 and re-check
  const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isPrivateV4(m[1]);
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip.includes(":")) return isPrivateV6(ip);
  return isPrivateV4(ip);
}

function looksLikeIpLiteral(host: string): boolean {
  // strip brackets for v6 literals
  const h = host.replace(/^\[|\]$/g, "");
  return /^[0-9.]+$/.test(h) || h.includes(":");
}

async function resolveHost(host: string): Promise<string[]> {
  try {
    // Deno.resolveDns is unstable in some runtimes — defensively try both A and AAAA.
    const tasks: Promise<string[]>[] = [];
    // @ts-ignore - resolveDns signature varies across Deno versions.
    tasks.push(Deno.resolveDns(host, "A").catch(() => [] as string[]));
    // @ts-ignore
    tasks.push(Deno.resolveDns(host, "AAAA").catch(() => [] as string[]));
    const [a, aaaa] = await Promise.all(tasks);
    return [...a, ...aaaa];
  } catch {
    return [];
  }
}

export interface SafeFetchOptions {
  /** If provided, the URL host MUST match (case-insensitive, www-stripped) one of these. */
  allowedHosts?: string[];
  /** Maximum bytes to read from the response body. Default: 1 MiB. */
  maxBytes?: number;
  /** Total timeout. Default: 10s. */
  timeoutMs?: number;
  /** Override request headers. */
  headers?: Record<string, string>;
  /** HTTP method. Default: GET. */
  method?: string;
  /** Request body. */
  body?: BodyInit;
  /** Allow http:// in addition to https://. Default: false. */
  allowHttp?: boolean;
  /** Whether to follow 3xx redirects (still SSRF-checked at each hop). Default: false. */
  followRedirects?: boolean;
  /** Maximum redirect hops. Default: 3. */
  maxRedirects?: number;
}

function normalizeHost(h: string): string {
  return h.toLowerCase().replace(/^www\./, "");
}

async function validateUrl(rawUrl: string, opts: SafeFetchOptions): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  // 1. Scheme
  const allowed = opts.allowHttp ? ["http:", "https:"] : ["https:"];
  if (!allowed.includes(u.protocol)) {
    throw new Error(`URL scheme not allowed: ${u.protocol}`);
  }

  // 2. No IP literals
  const host = u.hostname;
  if (looksLikeIpLiteral(host)) {
    throw new Error("URL must use a hostname, not an IP literal");
  }

  // 3. Host allowlist (if provided)
  if (opts.allowedHosts && opts.allowedHosts.length > 0) {
    const hostNorm = normalizeHost(host);
    const ok = opts.allowedHosts.some(a => normalizeHost(a) === hostNorm);
    if (!ok) throw new Error("URL host is not in allowlist");
  }

  // 4. DNS resolution check
  const ips = await resolveHost(host);
  if (ips.length === 0) throw new Error(`Hostname did not resolve: ${host}`);
  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      throw new Error(`URL resolves to a non-public address: ${ip}`);
    }
  }

  return u;
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  body: string;
  truncated: boolean;
  finalUrl: string;
}

/**
 * SSRF-guarded fetch with size + time caps. Returns body as text (truncated to maxBytes).
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 1024 * 1024; // 1 MiB
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.followRedirects ? (opts.maxRedirects ?? 3) : 0;

  let currentUrl = rawUrl;
  let hops = 0;
  let lastResponse: Response | null = null;

  while (true) {
    const validated = await validateUrl(currentUrl, opts);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      lastResponse = await fetch(validated.toString(), {
        method: opts.method ?? "GET",
        headers: opts.headers,
        body: opts.body,
        redirect: "manual",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Handle redirect ourselves so we can SSRF-check each hop.
    if (lastResponse.status >= 300 && lastResponse.status < 400) {
      if (hops >= maxRedirects) {
        throw new Error("Too many redirects");
      }
      const loc = lastResponse.headers.get("location");
      if (!loc) throw new Error("Redirect without Location header");
      currentUrl = new URL(loc, validated).toString();
      hops++;
      continue;
    }

    break;
  }

  const reader = lastResponse!.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  let truncated = false;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        truncated = true;
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
      chunks.push(value);
    }
  }

  const total = chunks.reduce((a, b) => a + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }

  return {
    status: lastResponse!.status,
    headers: lastResponse!.headers,
    body: new TextDecoder().decode(merged),
    truncated,
    finalUrl: lastResponse!.url || currentUrl,
  };
}
