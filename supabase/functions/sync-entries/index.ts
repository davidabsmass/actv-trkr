import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function deriveAvadaCanonicalId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const entry = p.entry as Record<string, unknown> | undefined;
  if (entry?.entry_id && typeof entry.entry_id === "string" && entry.entry_id.startsWith("avada_db_")) {
    return entry.entry_id;
  }
  return null;
}

function normalizeTimestampForCompare(ts: string): string {
  return ts.replace("T", " ").replace(/\+.*$/, "").replace(/\.\d+$/, "").trim();
}

function extractLeadExternalEntryId(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>).external_entry_id;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseVersion(version: string | null | undefined): [number, number, number] {
  if (!version) return [0, 0, 0];
  const parts = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isVersionAtLeast(version: string | null | undefined, minimum: string): boolean {
  const [major, minor, patch] = parseVersion(version);
  const [minMajor, minMinor, minPatch] = parseVersion(minimum);
  if (major !== minMajor) return major > minMajor;
  if (minor !== minMinor) return minor > minMinor;
  return patch >= minPatch;
}

/**
 * Detect if multiple Avada forms in the payload share the same (or nearly identical)
 * active entry ID sets — a clear sign of the global-fallback bug.
 */
function detectDuplicateAvadaSets(forms: any[]): boolean {
  const avadaForms = forms.filter((f: any) => {
    const extFormId = String(f.form_id || "");
    return extFormId !== "" && (f.entry_ids || []).length > 0;
  });

  if (avadaForms.length < 2) return false;

  // Compare entry ID sets pairwise — if any two are >80% identical, it's the bug
  for (let i = 0; i < avadaForms.length; i++) {
    for (let j = i + 1; j < avadaForms.length; j++) {
      const setA = new Set(avadaForms[i].entry_ids as string[]);
      const setB = new Set(avadaForms[j].entry_ids as string[]);
      const intersection = [...setA].filter(id => setB.has(id)).length;
      const smaller = Math.min(setA.size, setB.size);
      if (smaller > 0 && intersection / smaller > 0.8) {
        return true;
      }
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase
      .from("api_keys").select("org_id")
      .eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();

    if (!akRow) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = akRow.org_id;
    const body = await req.json();
    const { domain, forms } = body;

    if (!domain || !Array.isArray(forms)) {
      return new Response(JSON.stringify({ error: "Missing domain or forms array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: site } = await supabase
      .from("sites").select("id, plugin_version")
      .eq("org_id", orgId).eq("domain", domain).maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteId = site.id;
    const pluginOutdated = !isVersionAtLeast(site.plugin_version, "1.3.4");
    const minimumAvadaVersion = "1.3.12";
    const pluginNeedsAvadaFix = !isVersionAtLeast(site.plugin_version, minimumAvadaVersion);
    const detectedPluginVersion = site.plugin_version || "unknown";
    const warnings: string[] = [];
    let totalTrashed = 0;
    let totalRestored = 0;
    let requiresAvadaReset = false;

    // ── SAFETY GUARD 1: All Avada forms report 0 active entries ──
    const avadaFormsFromDb = await supabase
      .from("forms")
      .select("external_form_id, provider")
      .eq("org_id", orgId)
      .eq("site_id", siteId)
      .eq("provider", "avada");
    const avadaFormIds = new Set((avadaFormsFromDb.data || []).map((f: any) => f.external_form_id));

    const avadaInPayload = forms.filter((f: any) => avadaFormIds.has(String(f.form_id || "")));
    const allAvadaEmpty = avadaInPayload.length > 0 &&
      avadaInPayload.every((f: any) => (f.entry_ids || []).length === 0);

    if (allAvadaEmpty) {
      console.log(`sync-entries: ALL ${avadaInPayload.length} Avada forms report 0 active entries — skipping destructive sync`);
      warnings.push(
        pluginNeedsAvadaFix
          ? `Avada entry discovery failed — all ${avadaInPayload.length} Avada form(s) reported 0 active entries. Please update the plugin to v${minimumAvadaVersion}+ and click "Sync Forms" in WordPress.`
          : `Avada entry discovery failed on ACTV TRKR v${detectedPluginVersion} — all ${avadaInPayload.length} Avada form(s) reported 0 active entries. Run "Sync Forms" in WordPress, then re-sync entries.`
      );
    }

    // ── SAFETY GUARD 2: Duplicate active ID sets across Avada forms (global fallback bug) ──
    const avadaPayloadForms = forms.filter((f: any) => avadaFormIds.has(String(f.form_id || "")));
    const hasDuplicateAvadaSets = detectDuplicateAvadaSets(avadaPayloadForms);
    if (hasDuplicateAvadaSets) {
      console.log(`sync-entries: Avada forms have duplicate/overlapping active ID sets — enabling safe mode (no Avada trashing)`);
      warnings.push(
        pluginNeedsAvadaFix
          ? `Avada entry sync skipped — multiple forms reported identical entry lists (known issue in older plugin builds). Please update to v${minimumAvadaVersion}+ and re-sync.`
          : `Avada returned identical active-entry lists across multiple forms on ACTV TRKR v${detectedPluginVersion}. To protect your data, Avada delete-sync is running in safe mode (no trashing) until per-form entry IDs are detected.`
      );
    }

    for (const f of forms) {
      const extFormId = String(f.form_id || "");
      const activeEntryIds: string[] = (f.entry_ids || []).map(String);
      const entryTimestamps: Record<string, string> = f.entry_timestamps || {};

      if (!extFormId) continue;

      const { data: formRow } = await supabase
        .from("forms").select("id, provider")
        .eq("org_id", orgId).eq("site_id", siteId).eq("external_form_id", extFormId)
        .maybeSingle();

      if (!formRow) continue;
      const formId = formRow.id;
      const provider = formRow.provider || "";

      // ── AVADA SAFETY: all-empty payload means discovery failed, skip completely ──
      if (provider === "avada" && allAvadaEmpty) {
        console.log(`sync-entries: form=${extFormId} provider=avada safety_guard_all_empty=true -> skipping`);
        continue;
      }

      // Duplicate ID-set bug mode: allow restore/remap, but never trash Avada entries.
      const avadaDuplicateProtectionMode = provider === "avada" && hasDuplicateAvadaSets;
      if (avadaDuplicateProtectionMode) {
        console.log(`sync-entries: form=${extFormId} provider=avada duplicate_set_safe_mode=true`);
      }

      const { data: rawEvents } = await supabase
        .from("lead_events_raw")
        .select("external_entry_id, submitted_at, payload")
        .eq("org_id", orgId).eq("site_id", siteId).eq("form_id", formId);

      if (!rawEvents || rawEvents.length === 0) continue;

      const { data: leadRows } = await supabase
        .from("leads")
        .select("id, submitted_at, status, data")
        .eq("org_id", orgId)
        .eq("form_id", formId);

      const leadBuckets = new Map<string, { active: string[]; trashed: string[] }>();
      const leadExternalIdBuckets = new Map<string, { active: string[]; trashed: string[] }>();
      for (const lead of leadRows || []) {
        if (!lead.submitted_at) continue;
        const key = normalizeTimestampForCompare(lead.submitted_at);
        const bucket = leadBuckets.get(key) || { active: [], trashed: [] };
        if (lead.status === "trashed") {
          bucket.trashed.push(lead.id);
        } else {
          bucket.active.push(lead.id);
        }
        leadBuckets.set(key, bucket);

        const externalEntryId = extractLeadExternalEntryId((lead as any).data);
        if (externalEntryId) {
          const extBucket = leadExternalIdBuckets.get(externalEntryId) || { active: [], trashed: [] };
          if (lead.status === "trashed") {
            extBucket.trashed.push(lead.id);
          } else {
            extBucket.active.push(lead.id);
          }
          leadExternalIdBuckets.set(externalEntryId, extBucket);
        }
      }

      const activeSet = new Set(activeEntryIds);

      const activeTimestampSet = new Set<string>();
      for (const ts of Object.values(entryTimestamps)) {
        if (!ts) continue;
        activeTimestampSet.add(normalizeTimestampForCompare(ts));
      }

      const hasComparableAvadaActiveIds = activeEntryIds.some((id) =>
        id.startsWith("avada_") || id.startsWith("avada_db_"),
      );

      const toTrashEntries: { external_entry_id: string; submitted_at: string | null }[] = [];
      const toRestoreEntries: { external_entry_id: string; submitted_at: string | null }[] = [];
      const remapCandidates: { legacyId: string; canonicalId: string; submittedAt: string | null }[] = [];

      console.log(
        `sync-entries: form=${extFormId} provider=${provider} active=${activeEntryIds.length} raw=${rawEvents.length} timestamps=${activeTimestampSet.size}`,
      );

      // Safety: outdated plugin versions can return empty Avada active IDs incorrectly.
      if (provider === "avada" && pluginOutdated && activeEntryIds.length === 0) {
        const { data: restoredRows, error: restoreLegacyError } = await supabase
          .from("leads")
          .update({ status: "new" })
          .eq("org_id", orgId)
          .eq("form_id", formId)
          .eq("status", "trashed")
          .select("id");

        if (restoreLegacyError) throw restoreLegacyError;

        const restoredNow = restoredRows?.length || 0;
        totalRestored += restoredNow;
        console.log(`sync-entries: form=${extFormId} provider=avada plugin_outdated=true active=0 -> restored_all=${restoredNow}`);
        continue;
      }

      // If plugin reports ZERO active entries, trash all leads for this form.
      if (activeEntryIds.length === 0) {
        const { data: trashedRows, error: trashAllError } = await supabase
          .from("leads")
          .update({ status: "trashed" })
          .eq("org_id", orgId)
          .eq("form_id", formId)
          .neq("status", "trashed")
          .select("id");

        if (trashAllError) throw trashAllError;

        const trashedNow = trashedRows?.length || 0;
        totalTrashed += trashedNow;
        console.log(`sync-entries: form=${extFormId} provider=${provider} active=0 -> trashed_all=${trashedNow}`);
        continue;
      } else {
        for (const rawEvent of rawEvents) {
          const eid = rawEvent.external_entry_id;
          const submittedAt = rawEvent.submitted_at;

          if (activeSet.has(eid)) {
            toRestoreEntries.push(rawEvent);
            continue;
          }

          // Avada legacy reconciliation
          if (provider === "avada" && eid.startsWith("avada_") && !eid.startsWith("avada_db_")) {
            const canonicalId = deriveAvadaCanonicalId(rawEvent.payload);

            if (canonicalId && canonicalId !== eid) {
              remapCandidates.push({ legacyId: eid, canonicalId, submittedAt });
            }

            if (canonicalId && activeSet.has(canonicalId)) {
              // Canonical Avada DB ID is active in WordPress: legacy ID is stale and must be removed.
              toTrashEntries.push(rawEvent);
              continue;
            }

            if (submittedAt && activeTimestampSet.size > 0) {
              const submittedAtNorm = normalizeTimestampForCompare(submittedAt);
              if (activeTimestampSet.has(submittedAtNorm)) {
                toRestoreEntries.push(rawEvent);
              } else {
                toTrashEntries.push(rawEvent);
              }
              continue;
            }

            if (hasComparableAvadaActiveIds && activeSet.size > 0) {
              toTrashEntries.push(rawEvent);
            }
            continue;
          }

          // Standard matching for new-format or standard providers
          const isNewFormat = eid.startsWith("avada_db_") || eid.startsWith("ninja_db_") || eid.startsWith("cf7_db_");
          const isStandardProvider = provider === "gravity_forms" || provider === "wpforms" || provider === "fluent_forms";

          if (isNewFormat || isStandardProvider) {
            toTrashEntries.push(rawEvent);
          }
        }
      }

      // ── SAFETY GUARD 3: Full-trash pattern for Avada ──
      // If we would trash ALL raw events with zero restores, something is wrong
      if (provider === "avada" && !avadaDuplicateProtectionMode && toTrashEntries.length > 0 && toRestoreEntries.length === 0 && toTrashEntries.length === rawEvents.length) {
        console.log(`sync-entries: form=${extFormId} provider=avada full_trash_pattern=true (${toTrashEntries.length}/${rawEvents.length}) -> skipping destructive sync`);
        warnings.push(`Avada sync for form ${extFormId} skipped — all ${toTrashEntries.length} entries would be trashed with zero matches. Likely a discovery issue.`);
        requiresAvadaReset = true;
        continue;
      }

      console.log(
        `sync-entries: form=${extFormId} to_trash=${toTrashEntries.length} to_restore=${toRestoreEntries.length} remap_candidates=${remapCandidates.length}`,
      );

      const leadIdsToTrash = new Set<string>();
      for (const entry of toTrashEntries) {
        const extBucket = leadExternalIdBuckets.get(entry.external_entry_id);
        if (extBucket && extBucket.active.length > 0) {
          for (const leadId of extBucket.active) leadIdsToTrash.add(leadId);
          continue;
        }

        if (!entry.submitted_at) continue;
        const key = normalizeTimestampForCompare(entry.submitted_at);
        const bucket = leadBuckets.get(key);
        if (!bucket) continue;
        for (const leadId of bucket.active) leadIdsToTrash.add(leadId);
      }

      const leadIdsToRestore = new Set<string>();
      for (const entry of toRestoreEntries) {
        const extBucket = leadExternalIdBuckets.get(entry.external_entry_id);
        if (extBucket && extBucket.trashed.length > 0) {
          for (const leadId of extBucket.trashed) leadIdsToRestore.add(leadId);
          continue;
        }

        if (!entry.submitted_at) continue;
        const key = normalizeTimestampForCompare(entry.submitted_at);
        const bucket = leadBuckets.get(key);
        if (!bucket) continue;
        for (const leadId of bucket.trashed) leadIdsToRestore.add(leadId);
      }

      // Prefer restore when a timestamp collision appears in both buckets.
      for (const id of leadIdsToRestore) {
        leadIdsToTrash.delete(id);
      }

      if (avadaDuplicateProtectionMode && leadIdsToTrash.size > 0) {
        console.log(`sync-entries: form=${extFormId} provider=avada duplicate_set_safe_mode=true -> suppressing_trash=${leadIdsToTrash.size}`);
        leadIdsToTrash.clear();
      }

      if (leadIdsToTrash.size > 0) {
        const { data: trashedRows, error: trashError } = await supabase
          .from("leads")
          .update({ status: "trashed" })
          .in("id", Array.from(leadIdsToTrash))
          .neq("status", "trashed")
          .select("id");

        if (trashError) throw trashError;
        totalTrashed += (trashedRows?.length || 0);
      }

      if (leadIdsToRestore.size > 0) {
        const { data: restoredRows, error: restoreError } = await supabase
          .from("leads")
          .update({ status: "new" })
          .in("id", Array.from(leadIdsToRestore))
          .eq("status", "trashed")
          .select("id");

        if (restoreError) throw restoreError;
        totalRestored += (restoredRows?.length || 0);
      }

      // Remap legacy external_entry_ids to stable canonical IDs
      if (provider === "avada" && remapCandidates.length > 0) {
        for (const remap of remapCandidates) {
          const query = supabase
            .from("lead_events_raw")
            .update({ external_entry_id: remap.canonicalId })
            .eq("org_id", orgId)
            .eq("form_id", formId)
            .eq("external_entry_id", remap.legacyId);

          if (remap.submittedAt) {
            await query.eq("submitted_at", remap.submittedAt);
          } else {
            await query;
          }
        }
      }

      // Positional remap fallback for ninja_forms / cf7
      if (provider === "ninja_forms" || provider === "cf7") {
        const legacyPrefix = provider === "ninja_forms" ? "ninja_" : "cf7_";
        const newPrefix = provider === "ninja_forms" ? "ninja_db_" : "cf7_db_";

        const legacyEntries = rawEvents
          .filter(e => e.external_entry_id.startsWith(legacyPrefix) && !e.external_entry_id.startsWith(newPrefix))
          .sort((a, b) => (a.submitted_at || "").localeCompare(b.submitted_at || ""));

        const activeDbIds = activeEntryIds
          .filter(id => id.startsWith(newPrefix))
          .sort((a, b) => {
            const numA = parseInt(a.replace(newPrefix, ""), 10);
            const numB = parseInt(b.replace(newPrefix, ""), 10);
            return numA - numB;
          });

        if (legacyEntries.length > 0 && activeDbIds.length > 0 && legacyEntries.length <= activeDbIds.length) {
          for (let i = 0; i < legacyEntries.length; i++) {
            if (i < activeDbIds.length) {
              await supabase
                .from("lead_events_raw")
                .update({ external_entry_id: activeDbIds[i] })
                .eq("org_id", orgId)
                .eq("form_id", formId)
                .eq("external_entry_id", legacyEntries[i].external_entry_id);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        trashed: totalTrashed,
        restored: totalRestored,
        warnings,
        requires_avada_reset: requiresAvadaReset,
        blocked_reason: requiresAvadaReset ? "legacy_id_deadlock" : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-entries error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
