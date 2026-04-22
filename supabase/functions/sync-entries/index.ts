import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
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
 * Detect if multiple Avada forms share >80% identical entry ID sets (global-fallback bug).
 */
function detectDuplicateAvadaSets(forms: any[]): boolean {
  const avadaForms = forms.filter((f: any) => {
    const extFormId = String(f.form_id || "");
    return extFormId !== "" && (f.entry_ids || []).length > 0;
  });
  if (avadaForms.length < 2) return false;
  for (let i = 0; i < avadaForms.length; i++) {
    for (let j = i + 1; j < avadaForms.length; j++) {
      const setA = new Set(avadaForms[i].entry_ids as string[]);
      const setB = new Set(avadaForms[j].entry_ids as string[]);
      const intersection = [...setA].filter(id => setB.has(id)).length;
      const smaller = Math.min(setA.size, setB.size);
      if (smaller > 0 && intersection / smaller > 0.8) return true;
    }
  }
  return false;
}

/**
 * Extract the numeric WordPress DB ID from an entry ID string.
 * e.g. "avada_db_42" -> "42", "avada_1234567890" -> null, "123" -> "123"
 */
function extractWpDbId(entryId: string): string | null {
  // Canonical DB format: avada_db_N, ninja_db_N, cf7_db_N
  const dbMatch = entryId.match(/^(?:avada_db_|ninja_db_|cf7_db_)(\d+)$/);
  if (dbMatch) return dbMatch[1];
  // Plain numeric (gravity_forms, wpforms, fluent_forms)
  if (/^\d+$/.test(entryId)) return entryId;
  return null;
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
    const formAudit: any[] = [];

    // ── SAFETY GUARD: All Avada forms report 0 active entries ──
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
      console.log(`sync-entries: ALL ${avadaInPayload.length} Avada forms report 0 entries — skipping`);
      warnings.push(
        pluginNeedsAvadaFix
          ? `Avada discovery failed — all ${avadaInPayload.length} form(s) reported 0 entries. Update plugin to v${minimumAvadaVersion}+.`
          : `Avada discovery failed on v${detectedPluginVersion} — all ${avadaInPayload.length} form(s) reported 0 entries.`
      );
    }

    // ── SAFETY GUARD: Duplicate active ID sets across Avada forms ──
    const avadaPayloadForms = forms.filter((f: any) => avadaFormIds.has(String(f.form_id || "")));
    const hasDuplicateAvadaSets = detectDuplicateAvadaSets(avadaPayloadForms);
    if (hasDuplicateAvadaSets) {
      console.log(`sync-entries: Avada duplicate ID sets detected — safe mode`);
      warnings.push(
        pluginNeedsAvadaFix
          ? `Avada sync skipped — duplicate entry lists detected. Update to v${minimumAvadaVersion}+.`
          : `Avada duplicate entry lists on v${detectedPluginVersion} — safe mode active.`
      );
    }

    for (const f of forms) {
      const extFormId = String(f.form_id || "");
      const activeEntryIds: string[] = (f.entry_ids || []).map(String);

      if (!extFormId) continue;

      const { data: formRow } = await supabase
        .from("forms").select("id, provider")
        .eq("org_id", orgId).eq("site_id", siteId).eq("external_form_id", extFormId)
        .maybeSingle();

      if (!formRow) continue;
      const formId = formRow.id;
      const provider = formRow.provider || "";

      // ── AVADA SAFETY: all-empty or duplicate-set → skip ──
      if (provider === "avada" && allAvadaEmpty) {
        console.log(`sync-entries: form=${extFormId} avada all-empty → skip`);
        continue;
      }
      if (provider === "avada" && hasDuplicateAvadaSets) {
        console.log(`sync-entries: form=${extFormId} avada duplicate-set → skip`);
        continue;
      }

      // ── Safety: outdated plugin + avada + 0 entries → restore all ──
      if (provider === "avada" && pluginOutdated && activeEntryIds.length === 0) {
        const { data: restoredRows } = await supabase
          .from("leads")
          .update({ status: "new" })
          .eq("org_id", orgId).eq("form_id", formId).eq("status", "trashed")
          .select("id");
        totalRestored += restoredRows?.length || 0;
        continue;
      }

      // Get ALL leads for this form (any status)
      const { data: allLeads } = await supabase
        .from("leads")
        .select("id, status, external_entry_id, data")
        .eq("org_id", orgId)
        .eq("form_id", formId);

      if (!allLeads || allLeads.length === 0) continue;

      const existingStoredCount = allLeads.length;
      const existingActiveCount = allLeads.filter((lead: any) => lead.status !== "trashed").length;

      // ── If plugin reports 0 active, trash all for this form ──
      if (activeEntryIds.length === 0) {
        const protectLargeNonAvadaForm = provider !== "avada" && existingStoredCount >= 1000;

        if (protectLargeNonAvadaForm) {
          console.log(`sync-entries: form=${extFormId} provider=${provider} SAFETY: reported 0 active IDs while ${existingStoredCount} stored leads exist — skipping destructive trash`);
          warnings.push(`Form ${extFormId}: sync reported 0 active entries while ${existingStoredCount} stored entries exist, so destructive cleanup was skipped to protect data.`);
          continue;
        }

        const { data: trashedRows } = await supabase
          .from("leads")
          .update({ status: "trashed" })
          .eq("org_id", orgId).eq("form_id", formId).neq("status", "trashed")
          .select("id");
        totalTrashed += trashedRows?.length || 0;
        continue;
      }

      // ═══════════════════════════════════════════════════════════════
      // STRICT AUTHORITATIVE RECONCILIATION
      // WordPress entry IDs are the ONLY source of truth.
      // ═══════════════════════════════════════════════════════════════

      // Build the authoritative set of WordPress DB IDs
      const wpDbIds = new Set<string>();
      const wpFullIds = new Set(activeEntryIds);
      for (const id of activeEntryIds) {
        const dbId = extractWpDbId(id);
        if (dbId) wpDbIds.add(dbId);
      }

      console.log(`sync-entries: form=${extFormId} provider=${provider} wp_active=${activeEntryIds.length} wpDbIds=${wpDbIds.size}`);

      // For each lead, determine if it matches an active WordPress entry
      const leadsToTrash: string[] = [];
      const leadsToRestore: string[] = [];
      const seenWpIds = new Set<string>(); // track which WP IDs already have a lead

      // Get field counts for picking best candidate
      const leadIds = allLeads.map((l: any) => l.id);
      const { data: fieldCountRows } = await supabase
        .from("lead_fields_flat")
        .select("lead_id")
        .eq("org_id", orgId)
        .in("lead_id", leadIds);

      const fieldCounts = new Map<string, number>();
      for (const row of fieldCountRows || []) {
        fieldCounts.set(row.lead_id, (fieldCounts.get(row.lead_id) || 0) + 1);
      }

      // Map: wpDbId -> best lead candidate
      const wpIdToLeads = new Map<string, { id: string; status: string; fieldCount: number; extId: string }[]>();

      for (const lead of allLeads) {
        const extId = lead.external_entry_id || (lead.data as any)?.external_entry_id || null;
        if (!extId) {
          // No external_entry_id at all → cannot match, trash if active
          if (lead.status !== "trashed") leadsToTrash.push(lead.id);
          continue;
        }

        // Check if this lead's external_entry_id matches any WP active entry
        const dbId = extractWpDbId(extId);
        const isMatch = wpFullIds.has(extId) || (dbId && wpDbIds.has(dbId));

        if (!isMatch) {
          // ── Legacy Avada protection REMOVED ──
          // WordPress is now the sole source of truth. Legacy avada_* leads that
          // don't match any canonical avada_db_* entry will be trashed.
          if (lead.status !== "trashed") leadsToTrash.push(lead.id);
          continue;
        }

        // This lead matches a WP active entry
        const matchKey = dbId || extId;
        const existing = wpIdToLeads.get(matchKey) || [];
        existing.push({
          id: lead.id,
          status: lead.status,
          fieldCount: fieldCounts.get(lead.id) || 0,
          extId,
        });
        wpIdToLeads.set(matchKey, existing);
      }

      // For each WP ID, pick the BEST lead (most fields), trash duplicates, restore if needed
      for (const [wpId, candidates] of wpIdToLeads) {
        // Sort: most fields first, then prefer non-trashed, then prefer canonical ID format
        candidates.sort((a, b) => {
          if (b.fieldCount !== a.fieldCount) return b.fieldCount - a.fieldCount;
          // Prefer active over trashed
          if (a.status === "trashed" && b.status !== "trashed") return 1;
          if (b.status === "trashed" && a.status !== "trashed") return -1;
          // Prefer canonical (avada_db_) over legacy (avada_)
          const aCanon = a.extId.includes("_db_") ? 1 : 0;
          const bCanon = b.extId.includes("_db_") ? 1 : 0;
          return bCanon - aCanon;
        });

        const best = candidates[0];

        // Keep the best one active
        if (best.status === "trashed") {
          leadsToRestore.push(best.id);
        }
        seenWpIds.add(wpId);

        // Trash all other candidates for this WP ID
        for (let i = 1; i < candidates.length; i++) {
          if (candidates[i].status !== "trashed") {
            leadsToTrash.push(candidates[i].id);
          }
        }
      }

      // Remove any restore targets from the trash list
      const restoreSet = new Set(leadsToRestore);
      const finalTrash = leadsToTrash.filter(id => !restoreSet.has(id));

      // ── SAFETY GUARD: destructive full/near-full trash on suspicious payloads ──
      if (finalTrash.length > 0 && leadsToRestore.length === 0) {
        if (provider === "avada") {
          if (finalTrash.length >= existingActiveCount && existingActiveCount > 0) {
            console.log(`sync-entries: form=${extFormId} SAFETY: would trash all ${existingActiveCount} active leads with 0 restores → skipping`);
            warnings.push(`Avada form ${extFormId}: sync would trash all entries with no matches — likely a discovery issue. Skipping.`);
            continue;
          }
        }

        const suspiciousLargeNonAvadaShrink =
          provider !== "avada" &&
          existingStoredCount >= 1000 &&
          activeEntryIds.length < Math.ceil(existingStoredCount * 0.5) &&
          finalTrash.length >= Math.ceil(existingActiveCount * 0.5) &&
          existingActiveCount > 0;

        if (suspiciousLargeNonAvadaShrink) {
          console.log(`sync-entries: form=${extFormId} provider=${provider} SAFETY: would trash ${finalTrash.length}/${existingActiveCount} active leads from a suspiciously small authoritative set (${activeEntryIds.length}/${existingStoredCount}) → skipping`);
          warnings.push(`Form ${extFormId}: sync returned only ${activeEntryIds.length} active entries while ${existingStoredCount} stored entries exist, so destructive cleanup was skipped to protect data.`);
          continue;
        }
      }

      // Execute trash
      if (finalTrash.length > 0) {
        const { data: trashedRows } = await supabase
          .from("leads")
          .update({ status: "trashed" })
          .in("id", finalTrash)
          .neq("status", "trashed")
          .select("id");
        totalTrashed += trashedRows?.length || 0;
      }

      // Execute restore
      if (leadsToRestore.length > 0) {
        const { data: restoredRows } = await supabase
          .from("leads")
          .update({ status: "new" })
          .in("id", leadsToRestore)
          .eq("status", "trashed")
          .select("id");
        totalRestored += restoredRows?.length || 0;
      }

      // Also update external_entry_id column for any leads that have it in JSON but not in column
      for (const lead of allLeads) {
        if (!lead.external_entry_id && (lead.data as any)?.external_entry_id) {
          await supabase
            .from("leads")
            .update({ external_entry_id: (lead.data as any).external_entry_id })
            .eq("id", lead.id);
        }
      }

      // ── ORPHAN RECOVERY removed — WordPress is the sole source of truth ──
      // Legacy raw-event-only leads are no longer protected or recovered.

      // ── INVARIANT CHECK ──
      const { count: finalActiveCount } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("form_id", formId)
        .neq("status", "trashed");

      const wpCount = activeEntryIds.length;
      const appCount = finalActiveCount || 0;
      const parity = appCount === wpCount;

      formAudit.push({
        form_id: extFormId,
        provider,
        wp_count: wpCount,
        app_count: appCount,
        parity,
        trashed: finalTrash.length,
        restored: leadsToRestore.length,
      });

      if (!parity) {
        console.warn(`sync-entries: MISMATCH form=${extFormId} wp=${wpCount} app=${appCount}`);
        warnings.push(`Form ${extFormId}: count mismatch — WordPress has ${wpCount} entries, app shows ${appCount}.`);
      } else {
        console.log(`sync-entries: form=${extFormId} PARITY OK wp=${wpCount} app=${appCount}`);
      }

      // ── Remap legacy external_entry_ids in lead_events_raw to canonical ──
      if (provider === "avada") {
        const { data: rawEvents } = await supabase
          .from("lead_events_raw")
          .select("id, external_entry_id, payload")
          .eq("org_id", orgId).eq("site_id", siteId).eq("form_id", formId);

        for (const rawEvent of rawEvents || []) {
          const eid = rawEvent.external_entry_id;
          if (eid.startsWith("avada_") && !eid.startsWith("avada_db_")) {
            // Check if payload has a canonical ID
            const payload = rawEvent.payload as any;
            const entry = payload?.entry;
            if (entry?.entry_id && typeof entry.entry_id === "string" && entry.entry_id.startsWith("avada_db_")) {
              await supabase
                .from("lead_events_raw")
                .update({ external_entry_id: entry.entry_id })
                .eq("id", rawEvent.id);
            }
          }
        }
      }

      // ── Positional remap for ninja_forms / cf7 ──
      if (provider === "ninja_forms" || provider === "cf7") {
        const legacyPrefix = provider === "ninja_forms" ? "ninja_" : "cf7_";
        const newPrefix = provider === "ninja_forms" ? "ninja_db_" : "cf7_db_";

        const { data: rawEvents } = await supabase
          .from("lead_events_raw")
          .select("external_entry_id, submitted_at")
          .eq("org_id", orgId).eq("site_id", siteId).eq("form_id", formId);

        const legacyEntries = (rawEvents || [])
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
                .eq("org_id", orgId).eq("form_id", formId)
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
        audit: formAudit,
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
