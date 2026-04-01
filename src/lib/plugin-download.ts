export const LATEST_PLUGIN_VERSION = "1.5.9";

export async function downloadPlugin(apiKey?: string) {
  const zipUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-plugin-zip?t=${Date.now()}`;

  const response = await fetch(zipUrl, {
    cache: "no-store",
    headers: apiKey ? { "x-actvtrkr-api-key": apiKey } : undefined,
  });

  if (!response.ok) {
    throw new Error("Failed to download latest plugin package");
  }

  const blob = await response.blob();
  const fileUrl = URL.createObjectURL(blob);
  const contentDisposition = response.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition);
  const fileName = match?.[1] || `actv-trkr-${LATEST_PLUGIN_VERSION}.zip`;

  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(fileUrl);

  return fileName;
}
