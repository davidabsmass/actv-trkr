import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Key, Plus, Copy, Check, Ban, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { downloadPlugin } from "@/lib/plugin-download";
import { useTranslation } from "react-i18next";

export default function ApiKeysSection() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api_keys", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, label, created_at, revoked_at")
        .eq("org_id", orgId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const activeKeys = keys?.filter(k => !k.revoked_at) || [];
  const hasActiveKey = activeKeys.length > 0;

  const generateKey = async () => {
    if (!orgId) return;
    setGenerating(true);
    try {
      for (const k of activeKeys) {
        await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id);
      }
      const rawKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey));
      const keyHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error } = await supabase.from("api_keys").insert({ org_id: orgId, key_hash: keyHash, label: t("settings.defaultKeyLabel") });
      if (error) throw error;
      setNewKey(rawKey);
      queryClient.invalidateQueries({ queryKey: ["api_keys", orgId] });
      toast({ title: t("settings.apiKeyGenerated"), description: t("settings.apiKeyGeneratedDesc") });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("settings.errorGeneratingKey"), description: err?.message });
    } finally {
      setGenerating(false);
    }
  };

  const revokeKey = async (id: string) => {
    setRevokingId(id);
    try {
      const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["api_keys", orgId] });
      toast({ title: t("settings.keyRevoked") });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("settings.errorRevokingKey"), description: err?.message });
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("settings.apiKeys")}</h3>
        </div>
        <button
          onClick={generateKey}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          {generating ? t("settings.generating") : hasActiveKey ? t("settings.replaceKey") : t("settings.newKey")}
        </button>
      </div>

      {newKey && (
        <div className="mb-4 rounded-lg bg-secondary p-3 space-y-2">
          <p className="text-xs text-secondary-foreground/70 font-medium">
            {t("settings.newApiKeyNotice")}
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-secondary-foreground flex-1 break-all">{newKey}</code>
            <button onClick={copyKey} className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors">
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
          <button
            onClick={() => downloadPlugin(newKey)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground border border-border rounded-lg hover:bg-accent transition-colors"
          >
            <Download className="h-3 w-3" />
            {t("settings.downloadPluginWithKey")}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("settings.loadingKeys")}</p>
      ) : !keys?.length ? (
        <p className="text-xs text-muted-foreground">{t("settings.noApiKeys")}</p>
      ) : (
        <ScrollArea className="h-[220px]">
          <div className="space-y-2 pr-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{k.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.created")} {new Date(k.created_at).toLocaleDateString()}
                    {k.revoked_at && (
                      <span className="ml-2 text-destructive">
                        · {t("settings.revoked")} {new Date(k.revoked_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                {!k.revoked_at && (
                  <button
                    onClick={() => revokeKey(k.id)}
                    disabled={revokingId === k.id}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50"
                  >
                    <Ban className="h-3 w-3" />
                    {revokingId === k.id ? t("settings.revoking") : t("settings.revoke")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}