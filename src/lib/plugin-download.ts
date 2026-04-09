const PLUGIN_FILENAME_PATTERN = /filename="?([^";]+)"?/i;
const PLUGIN_VERSION_PATTERN = /actv-trkr-(\d+\.\d+\.\d+)\.zip/i;
const STATIC_PLUGIN_FILE_NAME = "actv-trkr-1.8.11.zip";

function getPluginZipUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-plugin-zip?t=${Date.now()}`;
}

function getPluginInfoUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plugin-update-check?action=info&t=${Date.now()}`;
}

function getStaticPluginZipUrl() {
  return `/downloads/${STATIC_PLUGIN_FILE_NAME}`;
}

function triggerBrowserDownload(blobUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.style.display = "none";
  link.href = blobUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  // Use setTimeout to ensure the click is fully detached from the current
  // execution context, preventing SPA navigation/remount side-effects.
  setTimeout(() => {
    link.click();
    // Small delay before cleanup so the browser has time to start the download
    setTimeout(() => {
      document.body.removeChild(link);
    }, 200);
  }, 0);
}

export function extractPluginFileName(contentDisposition?: string | null) {
  return PLUGIN_FILENAME_PATTERN.exec(contentDisposition || "")?.[1] || null;
}

export function extractPluginVersion(contentDisposition?: string | null) {
  const fileName = extractPluginFileName(contentDisposition);
  return PLUGIN_VERSION_PATTERN.exec(fileName || "")?.[1] || null;
}

export async function getLatestPluginVersion() {
  try {
    const infoResponse = await fetch(getPluginInfoUrl(), {
      cache: "no-store",
    });

    if (infoResponse.ok) {
      const data = await infoResponse.json();
      if (typeof data?.version === "string" && data.version) {
        return data.version;
      }
    }
  } catch {
    // Fall back to ZIP metadata if the info endpoint is temporarily unavailable.
  }

  try {
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
  } catch {
    return null;
  }
}

export async function downloadPlugin(apiKey?: string) {
  if (!apiKey) {
    triggerBrowserDownload(getStaticPluginZipUrl(), STATIC_PLUGIN_FILE_NAME);
    return STATIC_PLUGIN_FILE_NAME;
  }

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

  triggerBrowserDownload(fileUrl, fileName);
  URL.revokeObjectURL(fileUrl);

  return fileName;
}
