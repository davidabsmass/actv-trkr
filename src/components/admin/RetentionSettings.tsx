import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

type Settings = {
  no_data_rescue_hours: number;
  no_second_login_hours: number;
  inactivity_warning_days: number;
  weekly_summary_enabled: boolean;
  default_pause_days: number;
  default_save_offer: string;
  sender_name: string;
  sender_email: string;
  reply_to_email: string | null;
};

const DEFAULT: Settings = {
  no_data_rescue_hours: 48,
  no_second_login_hours: 168,
  inactivity_warning_days: 30,
  weekly_summary_enabled: true,
  default_pause_days: 30,
  default_save_offer: "pause",
  sender_name: "ACTV TRKR",
  sender_email: "support@actvtrkr.com",
  reply_to_email: null,
};

export default function RetentionSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("retention_settings").select("*").eq("id", 1).maybeSingle();
    if (data) setSettings({ ...DEFAULT, ...(data as Partial<Settings>) });
    setLoading(false);
  };

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("retention_settings")
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Settings saved", description: "Retention configuration updated." });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trigger Timing</CardTitle>
          <p className="text-xs text-muted-foreground">When automated retention flows fire after a signal.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="no_data" className="text-xs">No-data rescue (hours)</Label>
            <Input id="no_data" type="number" min={1} max={720}
              value={settings.no_data_rescue_hours}
              onChange={(e) => update("no_data_rescue_hours", Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground">Send if no first data after signup.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="no_login" className="text-xs">No 2nd login (hours)</Label>
            <Input id="no_login" type="number" min={1} max={720}
              value={settings.no_second_login_hours}
              onChange={(e) => update("no_second_login_hours", Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground">Nudge if user hasn't returned.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inactivity" className="text-xs">Inactivity warning (days)</Label>
            <Input id="inactivity" type="number" min={1} max={180}
              value={settings.inactivity_warning_days}
              onChange={(e) => update("inactivity_warning_days", Number(e.target.value))} />
            <p className="text-[11px] text-muted-foreground">Flag accounts idle this long.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Save Offers</CardTitle>
          <p className="text-xs text-muted-foreground">Default offers presented in the cancellation flow.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Default save offer</Label>
            <Select value={settings.default_save_offer} onValueChange={(v) => update("default_save_offer", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pause">Pause subscription</SelectItem>
                <SelectItem value="downgrade">Downgrade plan</SelectItem>
                <SelectItem value="discount">Discount</SelectItem>
                <SelectItem value="support">Talk to support</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pause_days" className="text-xs">Default pause length (days)</Label>
            <Input id="pause_days" type="number" min={7} max={180}
              value={settings.default_pause_days}
              onChange={(e) => update("default_pause_days", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sender Identity</CardTitle>
          <p className="text-xs text-muted-foreground">From-name and email used by retention transactional emails.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sender_name" className="text-xs">Sender name</Label>
            <Input id="sender_name" value={settings.sender_name}
              onChange={(e) => update("sender_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sender_email" className="text-xs">Sender email</Label>
            <Input id="sender_email" type="email" value={settings.sender_email}
              onChange={(e) => update("sender_email", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reply_to" className="text-xs">Reply-to (optional)</Label>
            <Input id="reply_to" type="email" value={settings.reply_to_email ?? ""}
              onChange={(e) => update("reply_to_email", e.target.value || null)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Switch
              checked={settings.weekly_summary_enabled}
              onCheckedChange={(v) => update("weekly_summary_enabled", v)}
            />
            <div>
              <p className="text-sm font-medium text-foreground">Weekly engagement summary</p>
              <p className="text-xs text-muted-foreground">Send the Monday performance recap to active accounts.</p>
            </div>
          </div>
          <Button onClick={save} disabled={saving} size="sm">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
