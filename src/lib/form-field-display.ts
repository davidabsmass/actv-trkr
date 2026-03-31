/**
 * Shared form field display logic — single source of truth for both
 * Forms.tsx and Entries.tsx.
 *
 * Principle: Show ALL lead_fields_flat data. Never filter out a field value.
 * Only skip known metadata keys and non-data field types.
 */

/* ── Skip sets ── */
const SKIP_TYPES = new Set([
  "submit", "notice", "html", "hidden", "captcha",
  "honeypot", "section", "page", "consent",
]);

const SKIP_KEYS = new Set([
  "data", "submission", "field_labels", "field_types",
  "field_keys", "hidden_field_names", "fields_holding_privacy_data",
]);

/* ── Helpers ── */
const isNumericKey = (v: string) => /^\d+(\.\d+)?$/.test(v);

const normalizeForDedup = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const isWeakLabel = (label: string) => {
  const l = label.trim();
  if (!l) return true;
  if (isNumericKey(l)) return true;
  if (/^field(\s+\d+)?$/i.test(l)) return true;
  return false;
};

const shouldUpgradeLabel = (existing: string, incoming: string) => {
  const current = existing.trim();
  const next = incoming.trim();
  if (!next) return false;
  if (isWeakLabel(current) && !isWeakLabel(next)) return true;
  return false;
};

const extractExternalEntryId = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  const direct = typeof record.external_entry_id === "string"
    ? record.external_entry_id.trim()
    : "";
  if (direct) return direct;

  const nestedEntry = record.entry;
  if (nestedEntry && typeof nestedEntry === "object") {
    const nestedId = typeof (nestedEntry as Record<string, unknown>).entry_id === "string"
      ? (nestedEntry as Record<string, unknown>).entry_id.trim()
      : "";
    if (nestedId) return nestedId;
  }

  return null;
};

/** Return a human-readable label from whatever we have */
const pickLabel = (label: string, key: string): string => {
  const trimLabel = (label || "").trim();
  const trimKey = (key || "").trim();
  // Prefer label if it's not empty and not just a number
  if (trimLabel && !isNumericKey(trimLabel)) return trimLabel;
  // Fall back to key (even if numeric — it's better than nothing)
  return trimKey || "Field";
};

/* ── Types ── */
export interface FieldColumn {
  key: string;
  label: string;
}

export interface BuildResult {
  fieldColumns: FieldColumn[];
  leadFieldMap: Map<string, Record<string, string>>;
}

interface FlatField {
  lead_id: string;
  field_key: string;
  field_label: string | null;
  field_type: string | null;
  value_text: string | null;
  value_number?: number | null;
  value_bool?: boolean | null;
  value_date?: string | null;
}

interface LeadRow {
  id: string;
  data?: unknown;
}

const getFlatFieldDisplayValue = (field: FlatField): string => {
  if (typeof field.value_text === "string" && field.value_text.trim()) {
    return field.value_text.trim();
  }
  if (typeof field.value_number === "number" && Number.isFinite(field.value_number)) {
    return String(field.value_number);
  }
  if (typeof field.value_bool === "boolean") {
    return field.value_bool ? "Yes" : "No";
  }
  if (typeof field.value_date === "string" && field.value_date.trim()) {
    return field.value_date.trim();
  }
  return "";
};

/* ── Main builder ── */
export function buildFieldColumns(
  fieldsRaw: FlatField[] | null | undefined,
  leads: LeadRow[] | null | undefined,
): BuildResult {
  const map = new Map<string, Record<string, string>>();

  // Column registry: key → { label, numericOrder, firstSeen }
  type ColMeta = { key: string; label: string; numericOrder: number; firstSeen: number };
  const columns = new Map<string, ColMeta>();
  let seenCounter = 0;

  // Dedup helper: normalized-label → column key (so "First Name" and "first name" merge)
  const labelToColKey = new Map<string, string>();

  // Support map to copy known values to sibling rows with same external_entry_id.
  // This keeps duplicate WordPress rows visible while avoiding blank clones.
  const leadExternalEntryId = new Map<string, string>();
  const externalEntryToLeadIds = new Map<string, string[]>();

  const ensureColumn = (colKey: string, label: string, numericOrder: number) => {
    const existing = columns.get(colKey);
    if (!existing) {
      columns.set(colKey, { key: colKey, label, numericOrder, firstSeen: seenCounter++ });
      labelToColKey.set(normalizeForDedup(label), colKey);
      return;
    }

    if (shouldUpgradeLabel(existing.label, label)) {
      const prevNorm = normalizeForDedup(existing.label);
      if (labelToColKey.get(prevNorm) === colKey) {
        labelToColKey.delete(prevNorm);
      }
      existing.label = label;
      labelToColKey.set(normalizeForDedup(label), colKey);
    }
  };

  const setValue = (leadId: string, colKey: string, value: string) => {
    if (!map.has(leadId)) map.set(leadId, {});
    map.get(leadId)![colKey] = value;
  };

  if (leads) {
    for (const lead of leads) {
      const externalEntryId = extractExternalEntryId(lead.data);
      if (!externalEntryId) continue;
      leadExternalEntryId.set(lead.id, externalEntryId);
      if (!externalEntryToLeadIds.has(externalEntryId)) {
        externalEntryToLeadIds.set(externalEntryId, []);
      }
      externalEntryToLeadIds.get(externalEntryId)!.push(lead.id);
    }
  }

  /* ─── Pass 1: flat fields (preferred) ─── */
  if (fieldsRaw && fieldsRaw.length > 0) {
    for (const f of fieldsRaw) {
      const rawKey = (f.field_key || "").trim();
      if (!rawKey) continue;
      if (SKIP_KEYS.has(rawKey)) continue;

      const rawType = (f.field_type || "").toLowerCase().trim();
      if (SKIP_TYPES.has(rawType)) continue;

      const label = pickLabel(f.field_label || "", rawKey);
      const colKey = `flat:${rawKey}`;
      const numOrd = isNumericKey(rawKey) ? Number(rawKey) : Number.MAX_SAFE_INTEGER;

      // Check if a column with same normalized label already exists → merge
      const normLabel = normalizeForDedup(label);
      const existingColKey = labelToColKey.get(normLabel);

      const finalColKey = existingColKey || colKey;
      ensureColumn(finalColKey, label, numOrd);

      const value = getFlatFieldDisplayValue(f);
      if (value) {
        setValue(f.lead_id, finalColKey, value);
      }
    }
  }

  /* ─── Pass 2: JSON fallback for leads without usable flat-field values ─── */
  if (leads) {
    for (const lead of leads) {
      if (map.has(lead.id)) continue;

      const rawData = lead.data as any;
      const payloadFields: any[] = Array.isArray(rawData?.fields)
        ? rawData.fields
        : Array.isArray(rawData)
          ? rawData
          : [];

      if (payloadFields.length === 0) continue;

      // Skip malformed Avada rows with single "data" blob
      if (
        payloadFields.length === 1 &&
        (payloadFields[0]?.name || payloadFields[0]?.label || "").toString().trim().toLowerCase() === "data"
      ) continue;

      for (const d of payloadFields) {
        const rawValue = d?.value;
        const value = rawValue == null ? "" : String(rawValue).trim();

        const rawName = String(d?.name || "").trim();
        const rawLabel = String(d?.label || "").trim();
        const rawType = String(d?.type || "").toLowerCase().trim();
        const baseKey = rawName || rawLabel;

        if (!baseKey || SKIP_KEYS.has(baseKey)) continue;
        if (SKIP_TYPES.has(rawType)) continue;

        const label = pickLabel(rawLabel, rawName);
        const normLabel = normalizeForDedup(label);

        // Try to merge with existing column
        let colKey = labelToColKey.get(normLabel);
        if (!colKey) {
          const base = `json:${normalizeForDedup(label) || "field"}`;
          colKey = base;
          let i = 2;
          while (columns.has(colKey) && normalizeForDedup(columns.get(colKey)!.label) !== normLabel) {
            colKey = `${base}_${i++}`;
          }
        }

        ensureColumn(colKey, label, Number.MAX_SAFE_INTEGER);
        if (value) {
          setValue(lead.id, colKey, value);
        }
      }

      // Ensure lead exists in map even with no values (shows row with all "—")
      if (!map.has(lead.id)) map.set(lead.id, {});
    }
  }

  // Pass 3: for rows with no values, borrow values from sibling rows that share
  // the same external_entry_id (common with historical Avada backfill duplicates).
  if (leads) {
    for (const lead of leads) {
      const existingValues = map.get(lead.id);
      if (existingValues && Object.keys(existingValues).length > 0) continue;

      const externalEntryId = leadExternalEntryId.get(lead.id);
      if (!externalEntryId) {
        if (!existingValues) map.set(lead.id, {});
        continue;
      }

      const peerLeadIds = externalEntryToLeadIds.get(externalEntryId) || [];
      let donorValues: Record<string, string> | null = null;

      for (const peerLeadId of peerLeadIds) {
        if (peerLeadId === lead.id) continue;
        const peerValues = map.get(peerLeadId);
        if (peerValues && Object.keys(peerValues).length > 0) {
          donorValues = peerValues;
          break;
        }
      }

      if (donorValues) {
        map.set(lead.id, { ...donorValues });
      } else if (!existingValues) {
        map.set(lead.id, {});
      }
    }
  }

  /* ─── Sort columns: numeric keys first (ascending), then first-seen ─── */
  const finalCols = [...columns.values()]
    .filter(c => !/^consent$/i.test(c.label.trim()))
    .sort((a, b) => {
      // Numeric-keyed columns first
      const aNum = a.numericOrder !== Number.MAX_SAFE_INTEGER;
      const bNum = b.numericOrder !== Number.MAX_SAFE_INTEGER;
      if (aNum && !bNum) return -1;
      if (!aNum && bNum) return 1;
      if (aNum && bNum) return a.numericOrder - b.numericOrder;
      return a.firstSeen - b.firstSeen;
    })
    .map(({ key, label }) => ({ key, label }));

  return { fieldColumns: finalCols, leadFieldMap: map };
}
