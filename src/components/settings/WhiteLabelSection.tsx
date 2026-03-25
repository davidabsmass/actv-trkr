import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Palette, Upload, Type, EyeOff, Save, Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function WhiteLabelSection() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["white_label", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from("white_label_settings").select("*").eq("org_id", orgId).maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  const [clientName, setClientName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#8b5cf6");
  const [accentColor, setAccentColor] = useState("#f59e0b");
  const [hideBranding, setHideBranding] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (settings) {
      setClientName(settings.client_name || "");
      setPrimaryColor(settings.primary_color || "#6366f1");
      setSecondaryColor(settings.secondary_color || "#8b5cf6");
      setAccentColor(settings.accent_color || "#f59e0b");
      setHideBranding(settings.hide_actv_branding || false);
      setLogoUrl(settings.logo_url || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error(t("settings.noOrg"));
      const payload = {
        org_id: orgId, client_name: clientName, primary_color: primaryColor,
        secondary_color: secondaryColor, accent_color: accentColor,
        hide_actv_branding: hideBranding, logo_url: logoUrl,
      };
      if (settings?.id) {
        const { error } = await supabase.from("white_label_settings").update(payload).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("white_label_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["white_label", orgId] });
      toast.success(t("settings.whiteLabelSaved"));
    },
    onError: (err: any) => toast.error(err.message || t("settings.failedToSave")),
  });

  const revertMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error(t("settings.noOrg"));
      if (settings?.id) {
        const { error } = await supabase.from("white_label_settings").delete().eq("id", settings.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setClientName(""); setPrimaryColor("#6366f1"); setSecondaryColor("#8b5cf6");
      setAccentColor("#f59e0b"); setHideBranding(false); setLogoUrl("");
      queryClient.invalidateQueries({ queryKey: ["white_label", orgId] });
      toast.success(t("settings.whiteLabelReverted"));
    },
    onError: (err: any) => toast.error(err.message || t("settings.failedToRevert")),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    if (file.size > 2 * 1024 * 1024) { toast.error(t("settings.logoTooLarge")); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${orgId}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage.from("client-logos").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("client-logos").getPublicUrl(path);
      setLogoUrl(urlData.publicUrl);
      toast.success(t("settings.logoUploaded"));
    } catch (err: any) {
      toast.error(err.message || t("settings.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        {t("settings.pdfReportExportsNote")} <span className="font-medium text-foreground">{t("settings.pdfReportExports")}</span>. {t("settings.dashboardNotChanged")}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Type className="h-4 w-4 text-primary" />
              {t("settings.clientIdentity")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="client-name" className="text-xs">{t("settings.clientOrgName")}</Label>
              <Input id="client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t("settings.exampleClientName")} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">{t("settings.appearsInHeaders")}</p>
            </div>
            <div>
              <Label className="text-xs">{t("settings.clientLogo")}</Label>
              <div className="mt-1 flex items-center gap-3">
                {logoUrl ? (
                  <div className="h-12 w-12 rounded-md border border-border bg-background flex items-center justify-center overflow-hidden">
                    <img src={logoUrl} alt={t("settings.logoAlt")} className="max-h-full max-w-full object-contain" />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-md border border-dashed border-border bg-muted/30 flex items-center justify-center">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <label className="cursor-pointer">
                    <span className="text-xs text-primary hover:underline">
                      {uploading ? t("settings.uploading") : logoUrl ? t("settings.replaceLogo") : t("settings.uploadLogo")}
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                  </label>
                  <p className="text-xs text-muted-foreground">{t("settings.logoFormats")}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4 text-primary" />
              {t("settings.reportColorScheme")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="primary-color" className="text-xs">{t("settings.primary")}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" id="primary-color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-8 w-8 rounded border border-border cursor-pointer" />
                  <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono text-xs h-8" />
                </div>
              </div>
              <div>
                <Label htmlFor="secondary-color" className="text-xs">{t("settings.secondary")}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" id="secondary-color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-8 w-8 rounded border border-border cursor-pointer" />
                  <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="font-mono text-xs h-8" />
                </div>
              </div>
              <div>
                <Label htmlFor="accent-color" className="text-xs">{t("settings.accent")}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" id="accent-color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-8 w-8 rounded border border-border cursor-pointer" />
                  <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="font-mono text-xs h-8" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("settings.preview")}</Label>
              <div className="mt-1 flex gap-0 rounded-md overflow-hidden h-6">
                <div className="flex-1" style={{ backgroundColor: primaryColor }} />
                <div className="flex-1" style={{ backgroundColor: secondaryColor }} />
                <div className="flex-1" style={{ backgroundColor: accentColor }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.colorAppliedNote")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{t("settings.removeBranding")}</p>
                <p className="text-xs text-muted-foreground">{t("settings.removeBrandingDesc")}</p>
              </div>
            </div>
            <Switch checked={hideBranding} onCheckedChange={setHideBranding} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => revertMutation.mutate()} disabled={revertMutation.isPending || !settings?.id} className="gap-2 text-destructive hover:text-destructive">
          {revertMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {t("settings.revertToDefaults")}
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {t("settings.saveWhiteLabel")}
        </Button>
      </div>
    </div>
  );
}