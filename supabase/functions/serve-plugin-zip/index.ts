import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-disposition, x-plugin-version",
};

const ZIP_ROOT = "actv-trkr";
const SOURCE_MAIN_FILE = "mission-metrics.php";
const TARGET_MAIN_FILE = "actv-trkr.php";
const CURRENT_PLUGIN_VERSION = "1.6.2";

// Generated from plugin-template directory.
// Files are embedded because edge functions cannot reliably read local subdirectories at runtime.
const PLUGIN_FILES: Record<string, string> = {
...
};

const TEMPLATE_FILES = Object.keys(PLUGIN_FILES);

function toZipPath(relativePath: string) {
  return `${ZIP_ROOT}/${relativePath === SOURCE_MAIN_FILE ? TARGET_MAIN_FILE : relativePath}`;
}

function patchEndpointUrl(content: string, endpointBase: string): string {
  return content
    .replace(/(\s*'endpoint_url'\s*=>\s*)'[^']*'/, `$1'${endpointBase}'`);
}

function patchMainPluginVersion(content: string): string {
  return content
    .replace(/^(\s*\*\s*Version:\s*)([0-9.]+)(\s*)$/m, `$1${CURRENT_PLUGIN_VERSION}$3`)
    .replace(/(MM_PLUGIN_VERSION'\s*,\s*')([0-9.]+)('\s*\))/m, `$1${CURRENT_PLUGIN_VERSION}$3`);
}

function transformFile(relativePath: string, content: string, endpointBase: string): string {
  if (relativePath === SOURCE_MAIN_FILE) {
    return patchMainPluginVersion(content);
  }

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

function buildFiles(endpointBase: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const relativePath of TEMPLATE_FILES) {
    const rawContent = PLUGIN_FILES[relativePath];
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
    const files = buildFiles(endpointBase);
    const classForms = files.get(`${ZIP_ROOT}/includes/class-forms.php`) ?? "";
    assertPluginFileSafety(classForms);

    const mainPluginFile = files.get(`${ZIP_ROOT}/${TARGET_MAIN_FILE}`);
    if (!mainPluginFile) {
      throw new Error("Packaged plugin is missing its main file.");
    }

    const pluginVersion = extractPluginVersion(mainPluginFile);
    const responseHeaders = {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="actv-trkr-${pluginVersion}.zip"`,
      "Content-Type": "application/zip",
      "x-plugin-version": pluginVersion,
    };

    if (req.method === "HEAD") {
      return new Response(null, { headers: responseHeaders });
    }

    const zip = new JSZip();

    for (const [path, contents] of files.entries()) {
      zip.file(path, contents);
    }

    const zipData = await zip.generateAsync({ type: "uint8array" });

    return new Response(zipData, {
      headers: responseHeaders,
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
