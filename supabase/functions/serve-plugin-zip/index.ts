import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TEMPLATE_DIR = new URL("./plugin-template/", import.meta.url);
const ZIP_ROOT = "actv-trkr";
const SOURCE_MAIN_FILE = "mission-metrics.php";
const TARGET_MAIN_FILE = "actv-trkr.php";
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const textFileExtensions = new Set([
  ".css",
  ".js",
  ".json",
  ".md",
  ".php",
  ".svg",
  ".txt",
]);

type TemplateFile = {
  contents: Uint8Array;
  relativePath: string;
};

function isTextFile(relativePath: string): boolean {
  const dotIndex = relativePath.lastIndexOf(".");
  if (dotIndex < 0) return false;
  return textFileExtensions.has(relativePath.slice(dotIndex));
}

function toZipPath(relativePath: string): string {
  if (relativePath === SOURCE_MAIN_FILE) {
    return `${ZIP_ROOT}/${TARGET_MAIN_FILE}`;
  }

  return `${ZIP_ROOT}/${relativePath}`;
}

function patchEndpointUrl(content: string, endpointBase: string): string {
  return content.replace(
    /(\s*'endpoint_url'\s*=>\s*)'[^']*'/,
    `$1'${endpointBase}'`,
  );
}

function transformTextFile(
  relativePath: string,
  content: string,
  endpointBase: string,
): string {
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

function assertPluginFileSafety(files: Map<string, Uint8Array>): void {
  const classForms = files.get(`${ZIP_ROOT}/includes/class-forms.php`);
  const classFormsText = classForms ? textDecoder.decode(classForms) : "";
  const knownBadTokens = [
    "if(!is_array($rows)||empty($rows))&&!empty($page_url)){",
    "if(!is_array($rows)||empty($rows))&&!empty($resolved_title)){",
    "if(!is_array($rows)||empty($rows))){",
  ];

  for (const token of knownBadTokens) {
    if (classFormsText.includes(token)) {
      throw new Error(
        `Refusing to build plugin ZIP: malformed class-forms.php token found: ${token}`,
      );
    }
  }
}

async function collectTemplateFiles(
  currentDir: URL,
  baseDir: URL,
  files: TemplateFile[],
): Promise<void> {
  for await (const entry of Deno.readDir(currentDir)) {
    const entryUrl = new URL(entry.isDirectory ? `${entry.name}/` : entry.name, currentDir);

    if (entry.isDirectory) {
      await collectTemplateFiles(entryUrl, baseDir, files);
      continue;
    }

    files.push({
      contents: await Deno.readFile(entryUrl),
      relativePath: decodeURIComponent(entryUrl.href.slice(baseDir.href.length)),
    });
  }
}

async function buildFiles(endpointBase: string): Promise<Map<string, Uint8Array>> {
  const templateFiles: TemplateFile[] = [];
  await collectTemplateFiles(TEMPLATE_DIR, TEMPLATE_DIR, templateFiles);

  if (templateFiles.length === 0) {
    throw new Error("Plugin template directory is empty.");
  }

  templateFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const files = new Map<string, Uint8Array>();

  for (const file of templateFiles) {
    let contents = file.contents;

    if (isTextFile(file.relativePath)) {
      const transformedText = transformTextFile(
        file.relativePath,
        textDecoder.decode(file.contents),
        endpointBase,
      );
      contents = textEncoder.encode(transformedText);
    }

    files.set(toZipPath(file.relativePath), contents);
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
    assertPluginFileSafety(files);

    const mainPluginFile = files.get(`${ZIP_ROOT}/${TARGET_MAIN_FILE}`);
    if (!mainPluginFile) {
      throw new Error("Packaged plugin is missing its main file.");
    }

    const pluginVersion = extractPluginVersion(textDecoder.decode(mainPluginFile));
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
