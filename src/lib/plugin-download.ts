import { pluginManifest } from "@/generated/plugin-manifest";

const PLUGIN_FILENAME_PATTERN = /filename="?([^";]+)"?/i;
const PLUGIN_VERSION_PATTERN = /actv-trkr-(\d+\.\d+\.\d+)\.zip/i;

/**
 * Always download from a single "latest" URL so every plugin update is
 * picked up automatically — no hardcoded version string to forget.
 */
const STATIC_PLUGIN_FILE_NAME = pluginManifest.downloadFileName;

function getPluginZipUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-plugin-zip?t=${Date.now()}`;
}

function getPluginInfoUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plugin-update-check?action=info&t=${Date.now()}`;
}

function getStaticPluginZipUrl() {
  return `/downloads/${STATIC_PLUGIN_FILE_NAME}?t=${Date.now()}`;
}

function triggerBrowserDownload(blobUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.style.display = "none";
  link.href = blobUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  setTimeout(() => {
    link.click();
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
  if (pluginManifest.version) {
    return pluginManifest.version;
  }

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

export class PluginDownloadError extends Error {
  stage: "fetch" | "http_error" | "blob" | "browser_trigger" | "unknown";
  httpStatus: number | null;
  downloadUrl: string;

  constructor(
    message: string,
    stage: PluginDownloadError["stage"],
    downloadUrl: string,
    httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "PluginDownloadError";
    this.stage = stage;
    this.httpStatus = httpStatus;
    this.downloadUrl = downloadUrl;
  }
}

export async function downloadPlugin(apiKey?: string) {
  const zipUrl = apiKey ? getPluginZipUrl() : getStaticPluginZipUrl();

  let response: Response;
  try {
    response = await fetch(zipUrl, {
      cache: "no-store",
      headers: apiKey ? { "x-actvtrkr-api-key": apiKey } : undefined,
    });
  } catch (err) {
    throw new PluginDownloadError(
      err instanceof Error ? err.message : "Network request failed",
      "fetch",
      zipUrl,
    );
  }

  if (!response.ok) {
    throw new PluginDownloadError(
      `Server returned ${response.status} ${response.statusText}`,
      "http_error",
      zipUrl,
      response.status,
    );
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (err) {
    throw new PluginDownloadError(
      err instanceof Error ? err.message : "Failed to read response body",
      "blob",
      zipUrl,
    );
  }

  const fileName = apiKey
    ? extractPluginFileName(response.headers.get("content-disposition")) || "actv-trkr.zip"
    : STATIC_PLUGIN_FILE_NAME;

  try {
    const fileUrl = URL.createObjectURL(blob);
    triggerBrowserDownload(fileUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(fileUrl), 5000);
  } catch (err) {
    throw new PluginDownloadError(
      err instanceof Error ? err.message : "Browser failed to start download",
      "browser_trigger",
      zipUrl,
    );
  }

  return fileName;
}
