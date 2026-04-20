# Key & Secret Management

## The split (C-3)

| Class | Where it lives | Who can read it | Examples |
| --- | --- | --- | --- |
| **Publishable** | shipped to the browser & plugin JS | anyone | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` |
| **Site ingest token** | `site_ingest_tokens` row, returned to the plugin once on registration | the plugin (write-only ingestion) | issued by `issue-site-ingest-token` |
| **Admin API key** | `api_keys.key_hash` (hashed at rest), provisioned to the plugin once | plugin admin paths only | used to call `magic-login`, `sync`, etc. |
| **Per-org signing secret** | `api_keys.signing_secret` (32-byte hex) | server-only; pushed to the plugin once via `provision-signing-secret`; stored in `mm_options.signing_secret` | used to HMAC every backend → plugin call |
| **Server-only secrets** | Supabase function env | edge functions only | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `PLUGIN_RELEASE_SIGNING_SECRET`, `CRON_SECRET`, `ADMIN_SECRET`, `GITHUB_TOKEN` |

### Guarantees

- The browser bundle and plugin JS never see anything from the server-only column.
- Public REST responses (`plugin-update-check`, `serve-plugin-zip`) never contain server secrets — only the per-release HMAC *signature* and the SHA-256 *digest* of the ZIP, both of which are non-secret.
- `key_hash` is what's stored on the WP side too — the raw API key is shown to the user once at generation and not recoverable.
- The `signing_secret` is **not** the raw API key — even a full read of the WP `wp_options` row only gives an attacker that one site's HMAC capability, not anyone else's.

## Rotation

| Secret | How to rotate | Impact |
| --- | --- | --- |
| Site ingest token | `issue-site-ingest-token` issues a new one; old one revoked | tracker.js refetches on next pageview |
| Admin API key | Generate new in Settings → API Keys (one-active-key policy auto-revokes the old one) | next plugin sync uses the new key |
| Signing secret | `provision-signing-secret` with `rotate=true` (TODO post v1.19.0) | future requests must be signed with the new secret |
| Stripe secret | Update in Lovable Cloud → Secrets, then redeploy `actv-webhook`, `create-checkout`, `customer-portal`, `cancel-subscription` | no customer impact if done together |
| `PLUGIN_RELEASE_SIGNING_SECRET` | Update secret + cut a release; old plugins that already verified the previous signature continue to run | only future updates are affected |

## Where each secret is read

- `STRIPE_SECRET_KEY` — `actv-webhook`, `create-checkout`, `customer-portal`, `cancel-subscription`, `check-subscription`
- `STRIPE_WEBHOOK_SECRET` — `actv-webhook` only
- `SUPABASE_SERVICE_ROLE_KEY` — every function that needs to bypass RLS (most of them)
- `PLUGIN_RELEASE_SIGNING_SECRET` — `plugin-update-check` only (signs the update tuple)
- `CRON_SECRET` — checked by every cron-driven function via `x-cron-secret` header
- `ADMIN_SECRET` — `admin-verify`, `admin-delete-org`, `admin-manage-user`, `admin-customer-detail`
- `LOVABLE_API_KEY` — AI-powered functions only (`dashboard-ai-insights`, `reports-ai-copy`, `seo-suggest-fix`, `ai-chatbot`, etc.)

## Anti-patterns we explicitly avoid

- ❌ Treating `sha256(api_key)` as a credential the plugin can replay (was the root of C-2 — fixed).
- ❌ Embedding any service-role key, Stripe key, or signing secret in the plugin source or browser bundle.
- ❌ Returning service secrets from any public endpoint.
- ❌ Falling back from "no signing secret" to "trust the legacy hash forever" — the plugin only does this until v1.19.0.
