// Lightweight CSV export utility for client-side downloads.

const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: Array<keyof T>,
): void {
  if (!rows.length) {
    const blob = new Blob([""], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, filename);
    return;
  }
  const cols = (columns ?? (Object.keys(rows[0]) as Array<keyof T>)) as string[];
  const header = cols.map(escapeCell).join(",");
  const body = rows
    .map((row) => cols.map((c) => escapeCell((row as Record<string, unknown>)[c])).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
