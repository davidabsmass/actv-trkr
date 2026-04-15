import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Import the shared module directly
import {
  checkRateLimit,
  validateDomain,
  redactSensitiveFields,
  checkPayloadSize,
  sanitizeStr,
  VALID_EVENT_TYPES,
  VALID_PAGEVIEW_TYPES,
} from "../_shared/ingestion-security.ts";

Deno.test("checkRateLimit allows first request", () => {
  const r = checkRateLimit("1.2.3.4", "site-1", "org-1");
  assertEquals(r.allowed, true);
});

Deno.test("validateDomain matches own site domain", () => {
  assert(validateDomain("example.com", "example.com", [], null));
});

Deno.test("validateDomain matches with www prefix", () => {
  assert(validateDomain("www.example.com", "example.com", [], null));
});

Deno.test("validateDomain rejects mismatched domain", () => {
  assertEquals(validateDomain("evil.com", "example.com", [], null), false);
});

Deno.test("validateDomain accepts allowed_domains list", () => {
  assert(validateDomain("staging.example.com", "example.com", ["staging.example.com"], null));
});

Deno.test("validateDomain validates origin header", () => {
  assert(validateDomain("other.com", "example.com", [], "https://example.com"));
});

Deno.test("redactSensitiveFields redacts password fields", () => {
  const fields = [
    { name: "password", value: "secret123" },
    { name: "email", value: "a@b.com" },
    { name: "cc_num", value: "4111111111111111" },
  ];
  const redacted = redactSensitiveFields(fields);
  assertEquals(redacted[0].value, "[REDACTED]");
  assertEquals(redacted[1].value, "a@b.com");
  assertEquals(redacted[2].value, "[REDACTED]");
});

Deno.test("redactSensitiveFields returns non-array input unchanged", () => {
  const result = redactSensitiveFields("not an array" as any);
  assertEquals(result as unknown as string, "not an array");
});

Deno.test("sanitizeStr truncates and trims", () => {
  assertEquals(sanitizeStr("  hello world  ", 5), "hello");
  assertEquals(sanitizeStr(null, 10), null);
  assertEquals(sanitizeStr("", 10), null);
  assertEquals(sanitizeStr("   ", 10), null);
});

Deno.test("VALID_EVENT_TYPES includes expected types", () => {
  assert(VALID_EVENT_TYPES.has("cta_click"));
  assert(VALID_EVENT_TYPES.has("outbound_click"));
  assertEquals(VALID_EVENT_TYPES.has("xss_attack"), false);
});

Deno.test("VALID_PAGEVIEW_TYPES includes pageview", () => {
  assert(VALID_PAGEVIEW_TYPES.has("pageview"));
  assert(VALID_PAGEVIEW_TYPES.has("time_update"));
});

Deno.test("checkPayloadSize rejects oversized body", () => {
  const big = "x".repeat(60000);
  const req = new Request("http://localhost", {
    method: "POST",
    body: big,
    headers: { "content-length": String(big.length) },
  });
  const result = checkPayloadSize(req, big);
  assertEquals(result, "Payload too large");
});

Deno.test("checkPayloadSize allows normal body", () => {
  const body = '{"page":"/home"}';
  const req = new Request("http://localhost", {
    method: "POST",
    body,
    headers: { "content-length": String(body.length) },
  });
  assertEquals(checkPayloadSize(req, body), null);
});
