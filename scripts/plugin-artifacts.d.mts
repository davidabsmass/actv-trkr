import type { Plugin } from "vite";

export declare function syncPluginArtifacts(root?: string): Promise<{
  version: string;
  zipPath: string;
  manifestPath: string;
  changed: boolean;
}>;

export declare function pluginArtifactsSyncPlugin(): Plugin;