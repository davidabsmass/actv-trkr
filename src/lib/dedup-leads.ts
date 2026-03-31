/**
 * Shared lead deduplication logic.
 *
 * Handles two dedup strategies:
 * 1. Standard: group by external_entry_id, keep the newest.
 * 2. Avada cross-source: real-time webhook entries (avada_TIMESTAMP_HASH)
 *    and DB-sync entries (avada_db_N) for the SAME submission share the
 *    same submitted_at timestamp. Group them and keep the one that is most
 *    likely to have rich field data (prefer avada_db_* entries which carry
 *    structured field metadata).
 */

function getExternalId(lead: any): string | null {
  if (
    lead.data &&
    typeof lead.data === "object" &&
    !Array.isArray(lead.data)
  ) {
    const extId = (lead.data as Record<string, any>).external_entry_id;
    if (typeof extId === "string" && extId.trim() !== "") return extId.trim();
  }
  return null;
}

/** Returns true if the external_entry_id looks like an Avada real-time webhook entry */
const isAvadaWebhook = (extId: string) =>
  /^avada_\d+_\d+$/.test(extId);

/** Returns true if the external_entry_id looks like an Avada DB-sync entry */
const isAvadaDbSync = (extId: string) =>
  /^avada_db_\d+$/.test(extId);

export function deduplicateLeads(leads: any[] | null | undefined): any[] {
  if (!leads || leads.length === 0) return [];

  // Step 1: Standard dedup by external_entry_id
  const byExternalId = new Map<string, any>();
  const withoutExternalId: any[] = [];

  for (const lead of leads) {
    const extId = getExternalId(lead);
    if (extId) {
      const existing = byExternalId.get(extId);
      if (
        !existing ||
        new Date(lead.submitted_at).getTime() >
          new Date(existing.submitted_at).getTime()
      ) {
        byExternalId.set(extId, lead);
      }
    } else {
      withoutExternalId.push(lead);
    }
  }

  const afterStandard = [...byExternalId.values(), ...withoutExternalId];

  // Step 2: Avada cross-source dedup
  // Group entries with the same submitted_at that are Avada webhook vs DB-sync pairs
  const byTimestamp = new Map<string, any[]>();
  const nonAvada: any[] = [];

  for (const lead of afterStandard) {
    const extId = getExternalId(lead);
    if (extId && (isAvadaWebhook(extId) || isAvadaDbSync(extId))) {
      const ts = new Date(lead.submitted_at).getTime().toString();
      if (!byTimestamp.has(ts)) byTimestamp.set(ts, []);
      byTimestamp.get(ts)!.push(lead);
    } else {
      nonAvada.push(lead);
    }
  }

  const dedupedAvada: any[] = [];
  for (const group of byTimestamp.values()) {
    if (group.length === 1) {
      dedupedAvada.push(group[0]);
      continue;
    }
    // Prefer avada_db_* entries (they carry structured field data with proper labels)
    const dbSyncEntry = group.find((l) => {
      const eid = getExternalId(l);
      return eid && isAvadaDbSync(eid);
    });
    dedupedAvada.push(dbSyncEntry || group[0]);
  }

  return [...nonAvada, ...dedupedAvada].sort(
    (a, b) =>
      new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );
}
