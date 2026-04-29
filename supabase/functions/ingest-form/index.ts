import { createClient } from "npm:@supabase/supabase-js@2";
import { gateOrgLifecycle } from "../_shared/org-lifecycle-gate.ts";
import { observe } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashFingerprint(parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("|"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function inferAvadaFieldName(type: string, value: string, position: number): string {
  const t = type.toLowerCase();
  if (t === "email") return "Email";
  if (t === "textarea") return "Message";
  if (t === "select") return "Category";
  if (t === "text" && value) {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return "Email";
    if (/^[\d\s\-\+\(\)]{7,}$/.test(value.replace(/\s/g, ""))) return "Phone";
    if (/^\d{4,5}(-\d{4})?$/.test(value)) return "Zip Code";
    if (/^[A-Z]{2}$/.test(value)) return "State";
  }
  const posMap: Record<number, string> = { 1: "Name", 2: "Phone", 3: "Email", 4: "Category", 5: "City", 6: "Zip Code", 7: "State", 8: "Country", 9: "Subject", 10: "Message" };
  return posMap[position] || `Field ${position}`;
}

/**
 * If fields array contains Avada CSV blobs (data + field_types entries),
 * parse them into individual field objects. Returns original fields if not Avada CSV.
 * 
 * Also handles "data-only" blobs (no field_types) by accepting an optional
 * schema template looked up from existing lead_fields_flat for the same form.
 */
/**
 * Pattern matchers for high-confidence field identification in CSV blobs.
 * Used to pre-assign values to fields BEFORE positional mapping.
 */
const FIELD_PATTERNS: { labelPattern: RegExp; valueTest: (v: string) => boolean }[] = [
  { labelPattern: /^email$/i, valueTest: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) },
  { labelPattern: /^phone$/i, valueTest: (v) => /^[\d\s\-\+\(\)]{7,}$/.test(v.replace(/\s/g, "")) },
  { labelPattern: /^(zip\s*code|zip|postal)$/i, valueTest: (v) => /^\d{4,5}(-\d{4})?$/.test(v) },
];

function parseAvadaFieldsIfNeeded(
  fields: any[],
  provider: string,
  schemaTemplate?: { field_key: string; field_label: string }[],
): any[] {
  if (provider !== "avada") return fields;
  
  const dataEntry = fields.find((f: any) => f.name === "data" || f.label === "data");
  const typesEntry = fields.find((f: any) => f.name === "field_types" || f.label === "field_types");
  
  // ── Case 1: data-only blob (no field_types) — use schema template ──
  if (dataEntry?.value && !typesEntry?.value && schemaTemplate && schemaTemplate.length > 0) {
    const raw = dataEntry.value as string;
    const parts = raw.split(", ");
    const expected = schemaTemplate.length;
    const values: string[] = [];
    
    if (parts.length <= expected) {
      for (let i = 0; i < expected; i++) values.push(parts[i] || "");
    } else {
      for (let i = 0; i < expected - 1; i++) values.push(parts[i] || "");
      values.push(parts.slice(expected - 1).join(", "));
    }
    
    // ── Pattern-based pre-assignment for high-confidence fields ──
    // This prevents positional shifts when optional fields (like phone) appear or disappear
    const preAssigned = new Map<number, number>(); // value_idx → schema_idx
    const schemaUsed = new Set<number>();
    const valueUsed = new Set<number>();
    
    for (const pattern of FIELD_PATTERNS) {
      const schemaIdx = schemaTemplate.findIndex((s, i) => !schemaUsed.has(i) && pattern.labelPattern.test(s.field_label));
      if (schemaIdx < 0) continue;
      
      // Find the FIRST matching value (only match if not already used)
      const valIdx = values.findIndex((v, i) => !valueUsed.has(i) && v.trim() && pattern.valueTest(v.trim()));
      if (valIdx < 0) continue;
      
      preAssigned.set(valIdx, schemaIdx);
      schemaUsed.add(schemaIdx);
      valueUsed.add(valIdx);
    }
    
    if (preAssigned.size > 0) {
      console.log(`Avada pattern pre-assigned ${preAssigned.size} fields: ${[...preAssigned.entries()].map(([vi, si]) => `val[${vi}]→${schemaTemplate[si].field_label}`).join(", ")}`);
    }
    
    // ── Positional mapping for remaining fields ──
    const parsed: any[] = [];
    let schemaPos = 0;
    
    for (let valIdx = 0; valIdx < values.length; valIdx++) {
      const val = (values[valIdx] || "").trim();
      if (!val || val === "Array") {
        // Skip this value, also advance schema position if not pre-assigned
        if (!valueUsed.has(valIdx)) {
          while (schemaPos < schemaTemplate.length && schemaUsed.has(schemaPos)) schemaPos++;
          schemaPos++;
        }
        continue;
      }
      
      if (preAssigned.has(valIdx)) {
        // Use pre-assigned field
        const si = preAssigned.get(valIdx)!;
        parsed.push({
          name: schemaTemplate[si].field_key,
          label: schemaTemplate[si].field_label,
          type: "text",
          value: val,
        });
      } else {
        // Positional: find next unused schema slot
        while (schemaPos < schemaTemplate.length && schemaUsed.has(schemaPos)) schemaPos++;
        if (schemaPos < schemaTemplate.length) {
          parsed.push({
            name: schemaTemplate[schemaPos].field_key,
            label: schemaTemplate[schemaPos].field_label,
            type: "text",
            value: val,
          });
          schemaUsed.add(schemaPos);
          schemaPos++;
        }
      }
    }
    
    if (parsed.length > 0) {
      console.log(`Avada data-only parser produced ${parsed.length} fields using schema template (${preAssigned.size} pattern-matched)`);
      return parsed;
    }
  }
  
  // ── Case 2: data + field_types blobs — original CSV parsing ──
  if (!dataEntry?.value || !typesEntry?.value) return fields;
  
  const SKIP_AVADA_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page", "checkbox"]);
  const types = typesEntry.value.split(", ").map((t: string) => t.trim());
  const labelsEntry = fields.find((f: any) => f.name === "field_labels" || f.label === "field_labels");
  const rawLabels = labelsEntry?.value ? labelsEntry.value.split(", ").map((l: string) => l.trim()) : [];
  const allLabelsEmpty = rawLabels.every((l: string) => !l || l === "");
  const allValues = (dataEntry.value as string).split(", ").map((v: string) => v.trim());

  const parsed: any[] = [];
  let dataFieldPos = 0;
  for (let i = 0; i < types.length; i++) {
    const type = types[i]?.toLowerCase() || "";
    if (SKIP_AVADA_TYPES.has(type)) continue;

    dataFieldPos++;
    const val = allValues[i] || "";
    if (!val || val === "Array") continue;

    let label: string;
    const rawLabel = rawLabels[i] || "";
    if (rawLabel && !allLabelsEmpty) {
      label = rawLabel;
    } else {
      label = inferAvadaFieldName(type, val, dataFieldPos);
    }

    parsed.push({
      name: label.toLowerCase().replace(/\s+/g, "_"),
      label: label,
      type: type,
      value: val,
    });
  }
  
  if (parsed.length > 0) {
    console.log(`Avada CSV parser produced ${parsed.length} fields from blob`);
    return parsed;
  }
  
  // CSV parsing failed — try greedy reassembly
  const expectedCount = types.filter((t: string) => !SKIP_AVADA_TYPES.has(t.toLowerCase().trim())).length;
  if (expectedCount > 0 && allValues.length > expectedCount) {
    const reassembled: string[] = [];
    let valIdx = 0;
    for (let i = 0; i < types.length; i++) {
      const type = types[i]?.toLowerCase().trim() || "";
      if (SKIP_AVADA_TYPES.has(type)) continue;
      
      if (reassembled.length < expectedCount - 1) {
        reassembled.push(allValues[valIdx] || "");
        valIdx++;
      } else {
        reassembled.push(allValues.slice(valIdx).join(", "));
        valIdx = allValues.length;
        break;
      }
    }
    
    let pos2 = 0;
    for (let i = 0; i < types.length; i++) {
      const type = types[i]?.toLowerCase().trim() || "";
      if (SKIP_AVADA_TYPES.has(type)) continue;
      
      const val = reassembled[pos2] || "";
      pos2++;
      if (!val) continue;
      
      const rawLabel = rawLabels[i] || "";
      const label = (rawLabel && !allLabelsEmpty) ? rawLabel : inferAvadaFieldName(type, val, pos2);
      
      parsed.push({
        name: label.toLowerCase().replace(/\s+/g, "_"),
        label: label,
        type: type,
        value: val,
      });
    }
    
    if (parsed.length > 0) {
      console.log(`Avada CSV reassembly produced ${parsed.length} fields`);
      return parsed;
    }
  }
  
  return fields;
}

/**
 * Look up known field schema for a form from existing lead_fields_flat entries.
 * Returns ordered array of {field_key, field_label} or null if none found.
 */
async function getFormFieldSchema(
  supabase: any,
  formId: string,
  orgId: string,
): Promise<{ field_key: string; field_label: string }[] | null> {
  // Step 1: Try to get ACTUAL field order from lead_events_raw entries with proper individual fields
  // These entries preserve the real form layout order (not numeric key order)
  let rawFieldOrder: string[] | null = null;
  try {
    const { data: rawEvents } = await supabase
      .from("lead_events_raw")
      .select("payload")
      .eq("form_id", formId)
      .eq("org_id", orgId)
      .order("submitted_at", { ascending: false })
      .limit(30);

    if (rawEvents) {
      for (const event of rawEvents) {
        const payload = event.payload as any;
        const fields = payload?.fields;
        if (Array.isArray(fields) && fields.length > 1) {
          // This is a proper individual-fields entry (not a CSV blob)
          const order = fields
            .filter((f: any) => {
              const n = (f.name || "").toString().trim();
              return n && n !== "data" && n !== "field_types" && n !== "field_labels" && n !== "field_keys";
            })
            .map((f: any) => (f.name || f.label || "").toString().trim());
          if (order.length >= 3) {
            rawFieldOrder = order;
            break;
          }
        }
      }
    }
  } catch (e) {
    console.error("Raw event field order lookup failed:", e);
  }

  // Step 2: Get all known field keys and labels from lead_fields_flat
  const { data: formLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("form_id", formId)
    .eq("org_id", orgId)
    .neq("status", "trashed")
    .limit(100);
  
  if (!formLeads || formLeads.length === 0) return null;
  const formLeadIds = formLeads.map((l: any) => l.id);
  
  const allFieldRows: any[] = [];
  for (let i = 0; i < formLeadIds.length; i += 50) {
    const batch = formLeadIds.slice(i, i + 50);
    const { data: fieldRows } = await supabase
      .from("lead_fields_flat")
      .select("field_key, field_label, lead_id")
      .eq("org_id", orgId)
      .in("lead_id", batch);
    if (fieldRows) allFieldRows.push(...fieldRows);
  }
  
  if (allFieldRows.length === 0) return null;
  
  // Deduplicate: keep first label seen per key
  const seen = new Map<string, string>();
  for (const row of allFieldRows) {
    if (!seen.has(row.field_key)) {
      seen.set(row.field_key, row.field_label || row.field_key);
    }
  }
  
  if (seen.size === 0) return null;

  // Step 3: Build schema in the ACTUAL form field order
  if (rawFieldOrder && rawFieldOrder.length > 0) {
    const orderedSchema: { field_key: string; field_label: string }[] = [];
    const usedKeys = new Set<string>();

    // First, add fields in the order they appear in the raw event
    for (const key of rawFieldOrder) {
      if (seen.has(key) && !usedKeys.has(key)) {
        orderedSchema.push({ field_key: key, field_label: seen.get(key)! });
        usedKeys.add(key);
      }
    }

    // Then, insert any remaining fields from lead_fields_flat that weren't in the raw event
    // (these are fields that were blank in the raw event we found)
    // Insert them by numeric position relative to their neighbors
    const remaining = [...seen.entries()]
      .filter(([key]) => !usedKeys.has(key))
      .map(([key, label]) => ({ field_key: key, field_label: label, numKey: parseInt(key) }))
      .sort((a, b) => {
        if (!isNaN(a.numKey) && !isNaN(b.numKey)) return a.numKey - b.numKey;
        return a.field_key.localeCompare(b.field_key);
      });

    for (const item of remaining) {
      // Find insert position: after the last field with a lower numeric key
      let insertIdx = orderedSchema.length;
      if (!isNaN(item.numKey)) {
        for (let i = 0; i < orderedSchema.length; i++) {
          const existingNum = parseInt(orderedSchema[i].field_key);
          if (!isNaN(existingNum) && existingNum > item.numKey) {
            insertIdx = i;
            break;
          }
        }
      }
      orderedSchema.splice(insertIdx, 0, { field_key: item.field_key, field_label: item.field_label });
    }

    console.log(`Schema template using raw event order: ${orderedSchema.map(s => `${s.field_key}(${s.field_label})`).join(", ")}`);
    return orderedSchema;
  }
  
  // Fallback: sort by numeric key (original behavior)
  const schema = [...seen.entries()]
    .map(([key, label]) => ({ field_key: key, field_label: label }))
    .sort((a, b) => {
      const aNum = parseInt(a.field_key);
      const bNum = parseInt(b.field_key);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.field_key.localeCompare(b.field_key);
    });
  
  return schema;
}

// In-memory dedup cache (survives within a single isolate lifetime)
const recentFingerprints = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 30_000; // 30s window
  for (const [k, v] of recentFingerprints) {
    if (v < cutoff) recentFingerprints.delete(k);
  }
}, 60_000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Auth
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase.from("api_keys").select("org_id").eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();
    if (!akRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const orgId = akRow.org_id;

    // ── Org lifecycle gate (cancel/grace/archived) ──
    const gate = await gateOrgLifecycle(supabase, orgId);
    if (gate) {
      return new Response(JSON.stringify(gate.body), { status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { entry, context, fields, provider } = body;
    if (!entry) return new Response(JSON.stringify({ error: "Missing entry data" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const providerName = provider || "unknown";

    const normalizeSubmittedAt = (value: unknown): string => {
      if (value === null || value === undefined || value === "") return new Date().toISOString();

      if (typeof value === "number" && Number.isFinite(value)) {
        if (value > 1_000_000_000_000) return new Date(value).toISOString();
        if (value > 1_000_000_000) return new Date(value * 1000).toISOString();
        return new Date().toISOString();
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return new Date().toISOString();

        if (/^\d+$/.test(trimmed)) {
          const n = Number(trimmed);
          if (Number.isFinite(n)) {
            if (n > 1_000_000_000_000) return new Date(n).toISOString();
            if (n > 1_000_000_000) return new Date(n * 1000).toISOString();
          }
          return new Date().toISOString();
        }

        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      }

      return new Date().toISOString();
    };

    const submittedAtIso = normalizeSubmittedAt(entry.submitted_at);

    // Resolve site
    const domain = context?.domain;
    if (!domain) return new Response(JSON.stringify({ error: "Missing domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: site } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    const siteId = site?.id;
    if (!siteId) return new Response(JSON.stringify({ error: "Unknown site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // --- Deduplication ---
    // Build a fingerprint from: domain + page_url + sorted field values + timestamp rounded to 10s
    const pageUrl = entry.source_url || entry.page_url || "";
    const fieldValues = (Array.isArray(fields) ? fields : [])
      .map((f: any) => `${f.name || f.id || f.label || ""}=${f.value || ""}`)
      .sort()
      .join("&");
    const tsRounded = Math.floor(Date.now() / 10_000).toString();
    const fingerprint = await hashFingerprint([orgId, domain, pageUrl, fieldValues, tsRounded]);

    // If JS capture arrives and a server-side hook already sent the same submission, skip
    if (providerName === "js_capture" && recentFingerprints.has(fingerprint)) {
      observe(supabase, { orgId, siteId, endpoint: "ingest-form", status: "ok", details: { dedup: true } });
      return new Response(JSON.stringify({ status: "deduplicated", provider: providerName }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // If server-side hook arrives and JS already captured, the server-side wins — we'll update below
    const jsAlreadyCaptured = recentFingerprints.has(fingerprint);
    recentFingerprints.set(fingerprint, Date.now());

    // Upsert form
    const extFormId = entry.form_id?.toString() || `dom_form_${fingerprint.slice(0, 8)}`;
    const rawTitle = (entry.form_title || entry.form_name || "").toString().trim();
    const stubName = `Form (${providerName})`;
    const formName = rawTitle || stubName;

    // Check if a form already exists with a real (non-stub) name. If so,
    // never overwrite it with the stub — only update other metadata.
    const { data: existingForm } = await supabase
      .from("forms")
      .select("id, name")
      .eq("site_id", siteId)
      .eq("provider", providerName)
      .eq("external_form_id", extFormId)
      .maybeSingle();

    const shouldKeepExistingName =
      existingForm &&
      existingForm.name &&
      existingForm.name !== stubName &&
      formName === stubName;

    const upsertPayload: Record<string, unknown> = {
      org_id: orgId,
      site_id: siteId,
      external_form_id: extFormId,
      provider: providerName,
    };
    if (!shouldKeepExistingName) upsertPayload.name = formName;

    const { data: formRow, error: formErr } = await supabase.from("forms")
      .upsert(upsertPayload, { onConflict: "site_id,provider,external_form_id" })
      .select("id")
      .single();
    if (formErr || !formRow) return new Response(JSON.stringify({ error: "Failed to create form" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const formId = formRow.id;

    // Insert raw event
    const extEntryId = entry.entry_id?.toString() || `${providerName}_${fingerprint.slice(0, 16)}`;

    // Canonical dedup key — collapses Avada's three legacy ID formats (N, avada_db_N, avada_<ts>_<rand>)
    // into a single identifier, and namespaces other providers by name. Backed by a UNIQUE
    // index on leads(form_id, external_entry_key).
    const externalEntryKey = (() => {
      if (providerName === "avada") {
        if (/^[0-9]+$/.test(extEntryId)) return `avada:${extEntryId}`;
        if (/^avada_db_[0-9]+$/.test(extEntryId)) return `avada:${extEntryId.replace(/^avada_db_/, "")}`;
        if (/^avada_[0-9]+_[0-9]+$/.test(extEntryId)) return `avada_legacy:${extEntryId}`;
      }
      return `${providerName}:${extEntryId}`;
    })();

    await supabase.from("lead_events_raw").upsert({
      org_id: orgId, site_id: siteId, form_id: formId,
      external_entry_id: extEntryId,
      submitted_at: submittedAtIso,
      payload: body, context: context || {},
      visitor_id: context?.visitor_id, session_id: context?.session_id,
    }, { onConflict: "org_id,site_id,form_id,external_entry_id", ignoreDuplicates: true });

    // Normalize lead
    let pagePath: string | null = null;
    if (pageUrl) { try { pagePath = new URL(pageUrl).pathname; } catch { /* ignore */ } }

    const utmSource = context?.utm?.utm_source || context?.utm_source || null;
    const utmMedium = context?.utm?.utm_medium || context?.utm_medium || null;
    const utmCampaign = context?.utm?.utm_campaign || context?.utm_campaign || null;
    let referrerDomain: string | null = null;
    if (context?.referrer) { try { referrerDomain = new URL(context.referrer).hostname; } catch { /* ignore */ } }

    // Detect self-referral (source = own domain) and treat as direct
    let siteDomain: string | null = null;
    if (pageUrl) { try { siteDomain = new URL(pageUrl).hostname; } catch { /* ignore */ } }
    const isSelfReferral = referrerDomain && siteDomain && referrerDomain === siteDomain;

    const source = utmSource || (isSelfReferral ? "direct" : referrerDomain) || "direct";
    const medium = utmMedium || (referrerDomain && !isSelfReferral ? "referral" : "direct");

    // Check for existing lead with same external_entry_id using dedicated column first, JSONB fallback.
    let existingLeadRows: any[] = [];
    let existingLeadError: any = null;

    // Primary lookup: dedicated column
    const { data: colLeads, error: colErr } = await supabase
      .from("leads")
      .select("id, submitted_at, status, created_at")
      .eq("org_id", orgId)
      .eq("site_id", siteId)
      .eq("form_id", formId)
      .eq("external_entry_id", extEntryId)
      .order("submitted_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(25);

    if (colErr) {
      existingLeadError = colErr;
    } else if (colLeads && colLeads.length > 0) {
      existingLeadRows = colLeads;
    } else {
      // Fallback: JSONB contains (for rows not yet backfilled)
      const { data: jsonLeads, error: jsonErr } = await supabase
        .from("leads")
        .select("id, submitted_at, status, created_at")
        .eq("org_id", orgId)
        .eq("site_id", siteId)
        .eq("form_id", formId)
        .contains("data", { external_entry_id: extEntryId })
        .order("submitted_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(25);
      if (jsonErr) existingLeadError = jsonErr;
      else existingLeadRows = jsonLeads || [];
    }

    if (existingLeadError) {
      console.error("Existing lead dedupe lookup failed:", existingLeadError);
      return new Response(JSON.stringify({ error: "Failed to check existing lead" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Avada legacy→canonical merge ──
    // If this is a canonical avada_db_* entry with no exact match, check for a legacy
    // avada_* lead with the same submitted_at timestamp and merge into it.
    if (existingLeadRows.length === 0 && providerName === "avada" && extEntryId.startsWith("avada_db_")) {
      const { data: legacyLeads } = await supabase
        .from("leads")
        .select("id, submitted_at, status, created_at, external_entry_id")
        .eq("org_id", orgId)
        .eq("site_id", siteId)
        .eq("form_id", formId)
        .eq("submitted_at", submittedAtIso)
        .neq("status", "trashed")
        .order("created_at", { ascending: true })
        .limit(5);

      const legacyMatch = (legacyLeads || []).find((l: any) =>
        l.external_entry_id &&
        l.external_entry_id.startsWith("avada_") &&
        !l.external_entry_id.startsWith("avada_db_")
      );

      if (legacyMatch) {
        // Upgrade the legacy lead to the canonical ID
        console.log(`Avada merge: upgrading legacy lead ${legacyMatch.id} (${legacyMatch.external_entry_id}) → ${extEntryId}`);
        await supabase
          .from("leads")
          .update({ external_entry_id: extEntryId })
          .eq("id", legacyMatch.id);

        existingLeadRows = [legacyMatch];
      }
    }

    const activeLeadRows = (existingLeadRows || []).filter((row: any) => row.status !== "trashed");
    let canonicalLead = (activeLeadRows[0] || existingLeadRows?.[0] || null) as any;
    const duplicateActiveLeadIds = activeLeadRows.slice(1).map((row: any) => row.id);

    if (duplicateActiveLeadIds.length > 0) {
      const { error: dedupeCleanupError } = await supabase
        .from("leads")
        .update({ status: "trashed" })
        .in("id", duplicateActiveLeadIds)
        .neq("status", "trashed");

      if (dedupeCleanupError) {
        console.error("Duplicate lead cleanup failed:", dedupeCleanupError);
      } else {
        console.log(`Auto-trashed ${duplicateActiveLeadIds.length} duplicate lead(s) for ${extEntryId}`);
      }
    }

    if (canonicalLead?.status === "trashed") {
      const { error: restoreCanonicalError } = await supabase
        .from("leads")
        .update({ status: "new" })
        .eq("id", canonicalLead.id)
        .eq("status", "trashed");

      if (restoreCanonicalError) {
        console.error("Canonical lead restore failed:", restoreCanonicalError);
      } else {
        canonicalLead = { ...canonicalLead, status: "new" };
      }
    }

    if (canonicalLead) {
      // If existing lead has no field data but incoming payload has fields, enrich it
      if (fields && Array.isArray(fields) && fields.length > 0) {
        const { count: existingFieldCount } = await supabase
          .from("lead_fields_flat")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", canonicalLead.id)
          .eq("org_id", orgId);

        if ((existingFieldCount || 0) === 0) {
          console.log(`Enriching existing lead ${canonicalLead.id} with ${fields.length} fields (provider=${providerName})`);
          
          // Get schema template for Avada data-only blobs
          const schemaTemplate = providerName === "avada" ? await getFormFieldSchema(supabase, formId, orgId) : null;
          const parsedFields = parseAvadaFieldsIfNeeded(fields, providerName, schemaTemplate || undefined);
          
          const ENRICH_SKIP_KEYS = new Set(["data", "submission", "field_labels", "field_types", "field_keys", "hidden_field_names", "fields_holding_privacy_data"]);
          const ENRICH_SKIP_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page"]);
          const flatRows = parsedFields
            .filter((f: any) => {
              if (f.value === undefined || f.value === null || f.value === "") return false;
              const key = f.name || f.id?.toString() || f.label || "unknown";
              if (ENRICH_SKIP_KEYS.has(key)) return false;
              if (ENRICH_SKIP_TYPES.has((f.type || "").toLowerCase())) return false;
              return true;
            })
            .map((f: any) => ({
              org_id: orgId, lead_id: canonicalLead.id,
              field_key: f.name || f.id?.toString() || f.label || "unknown",
              field_label: f.label || f.name || f.id?.toString(),
              field_type: f.type || "text",
              value_text: f.value?.toString() || null,
            }));
          if (flatRows.length > 0) {
            await supabase.from("lead_fields_flat").insert(flatRows);
            console.log(`Enriched lead ${canonicalLead.id} with ${flatRows.length} fields`);
          }
          observe(supabase, { orgId, siteId, endpoint: "ingest-form", status: "ok", details: { kind: "enriched" } });
          return new Response(JSON.stringify({ status: "enriched", lead_id: canonicalLead.id, fields_added: flatRows.length, provider: providerName, duplicates_trashed: duplicateActiveLeadIds.length }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      observe(supabase, { orgId, siteId, endpoint: "ingest-form", status: "ok", details: { kind: "deduplicated_lead" } });
      return new Response(JSON.stringify({ status: "deduplicated_lead", lead_id: canonicalLead.id, provider: providerName, duplicates_trashed: duplicateActiveLeadIds.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lead, error: leadErr } = await supabase.from("leads").insert({
      org_id: orgId, site_id: siteId, form_id: formId,
      submitted_at: submittedAtIso,
      page_url: pageUrl || null, page_path: pagePath,
      referrer: context?.referrer, referrer_domain: referrerDomain,
      utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign,
      utm_term: context?.utm?.utm_term, utm_content: context?.utm?.utm_content,
      source, medium, campaign: utmCampaign,
      visitor_id: context?.visitor_id, session_id: context?.session_id,
      data: { ...(fields ? { fields } : {}), external_entry_id: extEntryId },
      external_entry_id: extEntryId,
      lead_type: providerName,
    }).select("id").single();

    if (leadErr) {
      console.error("Lead insert error:", leadErr);
      return new Response(JSON.stringify({ error: "Failed to store lead" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Populate lead_fields_flat — use shared Avada CSV parser
    const SKIP_KEYS = new Set(["data", "submission", "field_labels", "field_types", "field_keys", "hidden_field_names", "fields_holding_privacy_data"]);
    const SKIP_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page"]);

    if (fields && Array.isArray(fields)) {
      // Parse Avada CSV blobs into individual fields if applicable
      const schemaTemplate2 = providerName === "avada" ? await getFormFieldSchema(supabase, formId, orgId) : null;
      const parsedFields = parseAvadaFieldsIfNeeded(fields, providerName, schemaTemplate2 || undefined);
      
      const flatRows = parsedFields
        .filter((f: any) => {
          if (f.value === undefined || f.value === null || f.value === "") return false;
          const key = f.name || f.id?.toString() || f.label || "unknown";
          if (SKIP_KEYS.has(key)) return false;
          if (SKIP_TYPES.has((f.type || "").toLowerCase())) return false;
          return true;
        })
        .map((f: any) => ({
          org_id: orgId, lead_id: lead.id,
          field_key: f.name || f.id?.toString() || f.label || "unknown",
          field_label: f.label || f.name || f.id?.toString(),
          field_type: f.type || "text",
          value_text: f.value?.toString() || null,
        }));
      if (flatRows.length > 0) await supabase.from("lead_fields_flat").insert(flatRows);
    }

    // ── Send real-time lead notification email + in-app ──
    // Skip notifications for historical/backfilled entries (submitted >10 min ago).
    // This prevents notification floods when WP plugin backfills imported entries.
    const submittedAtMs = entry.submitted_at ? new Date(entry.submitted_at).getTime() : Date.now();
    const ageMinutes = (Date.now() - submittedAtMs) / 60000;
    const isLiveSubmission = Number.isFinite(ageMinutes) && ageMinutes <= 10;

    if (!isLiveSubmission) {
      console.log(`Skipping lead notification — historical entry (age=${Math.round(ageMinutes)}min)`);
    } else {
      try {
        const escapeHtml = (s: string): string =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

        const safeFormName = escapeHtml(formName || "Form");
        const leadSource = escapeHtml(source || "direct");
        const leadPage = escapeHtml(pagePath || pageUrl || "Unknown page");
        const submittedAt = new Date(entry.submitted_at || Date.now()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

        // In-app notifications for all org members
        const { data: orgMembers } = await supabase.from("org_users").select("user_id").eq("org_id", orgId);
        if (orgMembers && orgMembers.length > 0) {
          const inboxRows = orgMembers.map((m: any) => ({
            user_id: m.user_id,
            site_id: siteId,
            lead_id: lead.id,
            title: `New lead from ${safeFormName}`,
            body: `Source: ${leadSource} · Page: ${leadPage}`,
          }));
          await supabase
            .from("notification_inbox")
            .upsert(inboxRows, { onConflict: "user_id,lead_id", ignoreDuplicates: true });
        }

        // Real-time email notification
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a1628; color: #e2e8f0; padding: 32px; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #ffffff; font-size: 20px; margin: 0;">🎯 New Lead Received</h1>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0;">${submittedAt}</p>
            </div>
            <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 12px; width: 100px;">Form</td><td style="padding: 8px 0; color: #ffffff; font-size: 14px; font-weight: 600;">${formName}</td></tr>
                <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 12px;">Source</td><td style="padding: 8px 0; color: #e2e8f0; font-size: 14px;">${leadSource}</td></tr>
                <tr><td style="padding: 8px 0; color: #94a3b8; font-size: 12px;">Page</td><td style="padding: 8px 0; color: #e2e8f0; font-size: 14px;">${leadPage}</td></tr>
              </table>
            </div>
            <div style="text-align: center; margin-top: 20px;">
              <a href="https://actvtrkr.com/entries" style="display: inline-block; background: #6C5CE7; color: #ffffff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">View Lead</a>
            </div>
            <p style="color: #64748b; font-size: 11px; text-align: center; margin-top: 24px;">Sent by ACTV TRKR · Manage preferences in Settings</p>
          </div>`;

        // Fire and forget — don't block the response
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
            "x-cron-secret": Deno.env.get("CRON_SECRET") || "",
          },
          body: JSON.stringify({
            type: "lead_realtime",
            org_id: orgId,
            subject: `🎯 New Lead — ${formName} (${leadSource})`,
            html_body: emailHtml,
            text_body: `New Lead Received\n\nForm: ${formName}\nSource: ${leadSource}\nPage: ${leadPage}\nTime: ${submittedAt}\n\nView lead: https://actvtrkr.com/entries`,
          }),
        }).catch(e => console.error("Lead notification email fire-and-forget error:", e));
      } catch (notifErr) {
        console.error("Notification error (non-fatal):", notifErr);
      }
    }

    observe(supabase, { orgId, siteId, endpoint: "ingest-form", status: "ok" });
    return new Response(JSON.stringify({ status: "ok", lead_id: lead.id, provider: providerName, deduplicated_js: jsAlreadyCaptured }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Form ingestion error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
