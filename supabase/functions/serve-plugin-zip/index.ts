import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZIP_ROOT = "actv-trkr";
const SOURCE_MAIN_FILE = "mission-metrics.php";
const TARGET_MAIN_FILE = "actv-trkr.php";
const TEMPLATE_BASE = "./plugin-template/";
const textDecoder = new TextDecoder();

const TEMPLATE_FILES = [
  "mission-metrics.php",
  "readme.txt",
  "assets/heartbeat.js",
  "assets/tracker.js",
  "includes/class-broken-links.php",
  "includes/class-forms.php",
  "includes/class-gravity.php",
  "includes/class-heartbeat.php",
  "includes/class-retry-queue.php",
  "includes/class-security.php",
  "includes/class-seo-fixes.php",
  "includes/class-settings.php",
  "includes/class-tracker.php",
  "includes/class-updater.php",
  "includes/class-woocommerce.php",
] as const;

function toZipPath(relativePath: string): string {
  if (relativePath === SOURCE_MAIN_FILE) return `${ZIP_ROOT}/${TARGET_MAIN_FILE}`;
  return `${ZIP_ROOT}/${relativePath}`;
}

function patchEndpointUrl(content: string, endpointBase: string): string {
  return content.replace(/(\s*'endpoint_url'\s*=>\s*)'[^']*'/, `$1'${endpointBase}'`);
}

function transformFile(relativePath: string, content: string, endpointBase: string): string {
  if (relativePath === "includes/class-settings.php") {
    return patchEndpointUrl(content, endpointBase);
  }

  return content;
}

function extractPluginVersion(mainPluginFile: string): string {
  const versionMatch =
    mainPluginFile.match(/^\s*\*\s*Version:\s*([0-9.]+)/m) ??
    mainPluginFile.match(/MM_PLUGIN_VERSION'\s*,\s*'([0-9.]+)'/m);

  if (!versionMatch) {
    throw new Error("Unable to determine plugin version from the packaged main file.");
  }

  return versionMatch[1];
}

function assertPluginFileSafety(classFormsText: string): void {
  const knownBadTokens = [
    "if(!is_array($rows)||empty($rows))&&!empty($page_url)){",
    "if(!is_array($rows)||empty($rows))&&!empty($resolved_title)){",
    "if(!is_array($rows)||empty($rows))){",
  ];

  for (const token of knownBadTokens) {
    if (classFormsText.includes(token)) {
      throw new Error(`Refusing to build plugin ZIP: malformed class-forms.php token found: ${token}`);
    }
  }
}

async function buildFiles(endpointBase: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  for (const relativePath of TEMPLATE_FILES) {
    const fileUrl = new URL(`${TEMPLATE_BASE}${relativePath}`, import.meta.url);
    const rawContent = await Deno.readTextFile(fileUrl);
    const content = transformFile(relativePath, rawContent, endpointBase);
    files.set(toZipPath(relativePath), content);
  }

  return files;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const endpointBase = `${Deno.env.get("SUPABASE_URL")!}/functions/v1`;
    const files = await buildFiles(endpointBase);
    const classForms = files.get(`${ZIP_ROOT}/includes/class-forms.php`) ?? "";
    assertPluginFileSafety(classForms);

    const mainPluginFile = files.get(`${ZIP_ROOT}/${TARGET_MAIN_FILE}`);
    if (!mainPluginFile) {
      throw new Error("Packaged plugin is missing its main file.");
    }

    const pluginVersion = extractPluginVersion(mainPluginFile);
    const zip = new JSZip();

    for (const [path, contents] of files.entries()) {
      zip.file(path, contents);
    }

    const zipData = await zip.generateAsync({ type: "uint8array" });

    return new Response(zipData, {
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="actv-trkr-${pluginVersion}.zip"`,
        "Content-Type": "application/zip",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    });
  }
});
