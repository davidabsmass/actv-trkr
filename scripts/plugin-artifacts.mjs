import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const PLUGIN_DIR_NAME = "mission-metrics-wp-plugin";
const ZIP_ROOT = "actv-trkr";
const LATEST_ZIP_FILE_NAME = "actv-trkr-latest.zip";
const DOWNLOAD_RELATIVE_PATH = path.join("public", "downloads", LATEST_ZIP_FILE_NAME);
const MANIFEST_RELATIVE_PATH = path.join("src", "generated", "plugin-manifest.ts");
const VERSION_PATTERNS = [
  /Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/i,
  /MM_PLUGIN_VERSION',\s*'([0-9]+\.[0-9]+\.[0-9]+)'/i,
];

async function listFilesRecursive(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function extractPluginVersion(pluginMainFilePath) {
  const source = await fs.readFile(pluginMainFilePath, "utf8");

  for (const pattern of VERSION_PATTERNS) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error(`Unable to determine plugin version from ${pluginMainFilePath}`);
}

function buildManifestSource(version) {
  return `export const pluginManifest = {\n  version: ${JSON.stringify(version)},\n  downloadFileName: ${JSON.stringify(LATEST_ZIP_FILE_NAME)},\n} as const;\n`;
}

async function writeIfChanged(filePath, nextContent) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  try {
    const currentContent = await fs.readFile(filePath);

    if (Buffer.isBuffer(nextContent)) {
      if (currentContent.equals(nextContent)) {
        return false;
      }
    } else if (currentContent.toString("utf8") === nextContent) {
      return false;
    }
  } catch {
    // File does not exist yet.
  }

  await fs.writeFile(filePath, nextContent);
  return true;
}

function isPluginSourceFile(filePath, pluginDirectoryPath) {
  const resolvedPath = path.resolve(filePath);
  return resolvedPath === pluginDirectoryPath || resolvedPath.startsWith(`${pluginDirectoryPath}${path.sep}`);
}

export async function syncPluginArtifacts(root = process.cwd()) {
  const pluginDirectoryPath = path.resolve(root, PLUGIN_DIR_NAME);
  const pluginMainFilePath = path.join(pluginDirectoryPath, "mission-metrics.php");
  const version = await extractPluginVersion(pluginMainFilePath);
  const zip = new JSZip();
  const pluginFiles = await listFilesRecursive(pluginDirectoryPath);

  await Promise.all(
    pluginFiles.map(async (filePath) => {
      const fileBuffer = await fs.readFile(filePath);
      const relativePath = path.relative(pluginDirectoryPath, filePath).split(path.sep).join("/");
      zip.file(`${ZIP_ROOT}/${relativePath}`, fileBuffer);
    }),
  );

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const zipPath = path.resolve(root, DOWNLOAD_RELATIVE_PATH);
  const manifestPath = path.resolve(root, MANIFEST_RELATIVE_PATH);

  const [zipChanged, manifestChanged] = await Promise.all([
    writeIfChanged(zipPath, zipBuffer),
    writeIfChanged(manifestPath, buildManifestSource(version)),
  ]);

  return {
    version,
    zipPath,
    manifestPath,
    changed: zipChanged || manifestChanged,
  };
}

export function pluginArtifactsSyncPlugin() {
  return {
    name: "actv-trkr-plugin-artifacts",
    async buildStart() {
      await syncPluginArtifacts(process.cwd());
    },
    configureServer(server) {
      const pluginDirectoryPath = path.resolve(server.config.root, PLUGIN_DIR_NAME);
      let syncTimer;

      const runSync = async () => {
        try {
          const result = await syncPluginArtifacts(server.config.root);
          if (result.changed) {
            server.ws.send({ type: "full-reload" });
          }
        } catch (error) {
          const message = error instanceof Error ? error.stack || error.message : String(error);
          server.config.logger.error(`[actv-trkr-plugin-artifacts] ${message}`);
        }
      };

      const scheduleSync = () => {
        if (syncTimer) {
          clearTimeout(syncTimer);
        }

        syncTimer = setTimeout(() => {
          void runSync();
        }, 50);
      };

      const onFileEvent = (filePath) => {
        if (isPluginSourceFile(filePath, pluginDirectoryPath)) {
          scheduleSync();
        }
      };

      server.watcher.add(pluginDirectoryPath);
      server.watcher.on("add", onFileEvent);
      server.watcher.on("change", onFileEvent);
      server.watcher.on("unlink", onFileEvent);
      server.watcher.on("unlinkDir", onFileEvent);

      scheduleSync();

      return () => {
        if (syncTimer) {
          clearTimeout(syncTimer);
        }

        server.watcher.off("add", onFileEvent);
        server.watcher.off("change", onFileEvent);
        server.watcher.off("unlink", onFileEvent);
        server.watcher.off("unlinkDir", onFileEvent);
      };
    },
  };
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  const result = await syncPluginArtifacts();
  console.log(`Synced ACTV TRKR plugin artifacts for v${result.version}`);
}