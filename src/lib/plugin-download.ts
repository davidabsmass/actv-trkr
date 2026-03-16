const PLUGIN_VERSION = "1.3.3";
const PLUGIN_ZIP_PATH = `/actv-trkr-${PLUGIN_VERSION}.zip`;

export async function downloadPlugin(_apiKey?: string) {
  const link = document.createElement("a");
  link.href = PLUGIN_ZIP_PATH;
  link.download = `actv-trkr-${PLUGIN_VERSION}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
