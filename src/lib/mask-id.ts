/**
 * Visual masking helpers for sensitive identifiers shown in admin UIs.
 *
 * These NEVER touch the underlying value — they only produce a display
 * string. The full ID is still available client-side for "Reveal" /
 * "Copy" actions, but the default presentation is masked so a casual
 * screenshot or shoulder-surf doesn't leak usable Stripe object IDs.
 */

/**
 * Mask a Stripe-style ID like `cus_1A2B3C4D5E6F`:
 *   maskStripeId("cus_1A2B3C4D5E6F") → "cus_•••••5E6F"
 *
 * Falls back to the raw value if it doesn't have a recognizable prefix.
 */
export function maskStripeId(id?: string | null): string {
  if (!id) return "—";
  const trimmed = String(id).trim();
  const m = trimmed.match(/^([a-z]+)_(.+)$/i);
  if (!m) return mask(trimmed);
  const [, prefix, rest] = m;
  const tail = rest.length <= 4 ? rest : rest.slice(-4);
  return `${prefix}_•••••${tail}`;
}

/** Generic 4-char tail mask for non-prefixed identifiers. */
function mask(value: string): string {
  if (value.length <= 4) return "••••";
  return `•••••${value.slice(-4)}`;
}
