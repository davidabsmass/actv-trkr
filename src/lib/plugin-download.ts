const PLUGIN_FILENAME_PATTERN = /filename="?([^";]+)"?/i;
const PLUGIN_VERSION_PATTERN = /actv-trkr-(\d+\.\d+\.\d+)\.zip/i;

function getPluginZipUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-plugin-zip?t=${Date.now()}`;
}

export function extractPluginFileName(contentDisposition?: string | null) {
  return PLUGIN_FILENAME_PATTERN.exec(contentDisposition || "")?.[1] || null;
}

export function extractPluginVersion(contentDisposition?: string | null) {
  const fileName = extractPluginFileName(contentDisposition);
  return PLUGIN_VERSION_PATTERN.exec(fileName || "")?.[1] || null;
}

export async function getLatestPluginVersion() {
  const response = await fetch(getPluginZipUrl(), {
    method: "HEAD",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (
    response.headers.get("x-plugin-version") ||
    extractPluginVersion(response.headers.get("content-disposition"))
  );
}

export async function downloadPlugin(apiKey?: string) {
  const zipUrl = getPluginZipUrl();

  const response = await fetch(zipUrl, {
    cache: "no-store",
    headers: apiKey ? { "x-actvtrkr-api-key": apiKey } : undefined,
  });

  if (!response.ok) {
    throw new Error("Failed to download latest plugin package");
  }

  const blob = await response.blob();
  const fileUrl = URL.createObjectURL(blob);
  const fileName = extractPluginFileName(response.headers.get("content-disposition")) || "actv-trkr.zip";

  const link = document.createElement("a");
  link.href = fileUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(fileUrl);

  return fileName;
}
