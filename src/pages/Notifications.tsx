import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { format } from "date-fns";
import { Bell, Check, CheckCheck, Inbox, Shield, Globe, Lock, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ALERT_TYPES = [
  { key: "DOWNTIME", label: "Downtime", desc: "Site goes offline or misses heartbeats", icon: Globe },
  { key: "SSL_EXPIRY", label: "SSL Expiry", desc: "SSL certificate expiring soon", icon: Lock },
  { key: "DOMAIN_EXPIRY", label: "Domain Expiry", desc: "Domain registration expiring soon", icon: Shield },
  { key: "BROKEN_LINKS", label: "Broken Links", desc: "New broken links detected on your site", icon: Link2 },
] as const;

const CHANNELS = ["in_app", "email"] as const;

export default function NotificationsPage() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();

  const { data: inbox, isLoading } = useQuery({
    queryKey: ["notification_inbox", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("notification_inbox")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: prefs } = useQuery({
    queryKey: ["user_notif_prefs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: siteSubs } = useQuery({
    queryKey: ["user_site_subs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_site_subscriptions")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: sites } = useQuery({
    queryKey: ["sites_for_notif", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("sites")
        .select("id, domain")
        .eq("org_id", orgId);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notification_inbox").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification_inbox", user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      await supabase.from("notification_inbox").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification_inbox", user?.id] }),
  });

  const updatePref = useMutation({
    mutationFn: async ({ channel, enabled, phone }: { channel: string; enabled: boolean; phone?: string }) => {
      if (!user?.id) return;
      const upsertData: any = { user_id: user.id, channel, is_enabled: enabled };
      if (phone !== undefined) upsertData.phone = phone;
      await supabase.from("user_notification_preferences").upsert(upsertData, { onConflict: "user_id,channel" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user_notif_prefs", user?.id] }),
  });

  const updateSiteSub = useMutation({
    mutationFn: async ({ siteId, alertType, channel, enabled }: { siteId: string; alertType: string; channel: string; enabled: boolean }) => {
      if (!user?.id) return;
      await supabase.from("user_site_subscriptions").upsert(
        { user_id: user.id, site_id: siteId, alert_type: alertType, channel, is_enabled: enabled },
        { onConflict: "user_id,site_id,alert_type,channel" }
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user_site_subs", user?.id] }),
  });

  const getPref = (channel: string) => prefs?.find(p => p.channel === channel);
  const getSubEnabled = (siteId: string, alertType: string, channel: string) => {
    const sub = siteSubs?.find(s => s.site_id === siteId && s.alert_type === alertType && s.channel === channel);
    return sub?.is_enabled ?? true; // default enabled
  };
  const unreadCount = inbox?.filter(n => !n.is_read).length || 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Notifications</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage your alerts and preferences.</p>

      <Tabs defaultValue="inbox" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbox" className="gap-1.5">
            Inbox
            {unreadCount > 0 && <Badge className="h-4 min-w-[16px] px-1 text-[10px]">{unreadCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="alerts">Monitoring Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-3">
          {unreadCount > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => markAllRead.mutate()}>
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="glass-card p-6 animate-pulse"><div className="h-20 bg-muted rounded" /></div>
          ) : (!inbox || inbox.length === 0) ? (
            <div className="glass-card p-8 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {inbox.map(n => (
                  <div
                    key={n.id}
                    className={`border rounded-lg p-4 flex items-start gap-3 transition-colors ${!n.is_read ? "bg-primary/10 border-primary/30" : "bg-card border-border"}`}
                  >
                    <Bell className={`h-4 w-4 mt-0.5 flex-shrink-0 ${!n.is_read ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? "font-semibold text-foreground" : "text-foreground"}`}>{n.title}</p>
                      {n.body && <p className="text-xs mt-0.5 text-muted-foreground">{n.body}</p>}
                      <p className="text-[10px] mt-1 text-muted-foreground">{format(new Date(n.created_at), "MMM d, HH:mm")}</p>
                    </div>
                    {!n.is_read && (
                      <button onClick={() => markRead.mutate(n.id)} className="text-primary hover:text-primary/80">
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4">
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Channel Preferences</h3>
            <p className="text-xs text-muted-foreground">Control which channels you receive notifications on. These apply globally.</p>
            {(["in_app", "email", "sms"] as const).map(channel => {
              const pref = getPref(channel);
              return (
                <div key={channel} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">{channel.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {channel === "in_app" && "Always available"}
                      {channel === "email" && "Receive alerts via email"}
                      {channel === "sms" && "Receive alerts via SMS (coming soon)"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {channel === "sms" && (
                      <Input
                        placeholder="+1 555 0000"
                        className="w-36 h-8 text-xs"
                        value={pref?.phone || ""}
                        onChange={e => updatePref.mutate({ channel, enabled: pref?.is_enabled ?? true, phone: e.target.value })}
                      />
                    )}
                    <Switch
                      checked={pref?.is_enabled ?? (channel === "in_app" || channel === "email")}
                      onCheckedChange={(checked) => updatePref.mutate({ channel, enabled: checked })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="glass-card p-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Monitoring Alert Subscriptions</h3>
              <p className="text-xs text-muted-foreground mt-1">Choose which monitoring alerts you receive per site and channel.</p>
            </div>

            {(!sites || sites.length === 0) ? (
              <p className="text-sm text-muted-foreground">No sites configured yet.</p>
            ) : (
              sites.map(site => (
                <div key={site.id} className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{site.domain}</h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase">
                      <span>Alert Type</span>
                      {CHANNELS.map(ch => (
                        <span key={ch} className="text-center">{ch.replace("_", " ")}</span>
                      ))}
                    </div>
                    {/* Rows */}
                    {ALERT_TYPES.map(({ key, label, desc, icon: Icon }) => (
                      <div key={key} className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-3 border-t border-border items-center">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{label}</p>
                            <p className="text-[10px] text-muted-foreground">{desc}</p>
                          </div>
                        </div>
                        {CHANNELS.map(ch => (
                          <div key={ch} className="flex justify-center">
                            <Switch
                              checked={getSubEnabled(site.id, key, ch)}
                              onCheckedChange={(checked) => updateSiteSub.mutate({
                                siteId: site.id,
                                alertType: key,
                                channel: ch,
                                enabled: checked,
                              })}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
