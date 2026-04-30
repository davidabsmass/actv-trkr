import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, Mail, Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink, MapPin } from "lucide-react";
import TeamSection from "@/components/account/TeamSection";
import TwoFactorSection from "@/components/account/TwoFactorSection";
import SecuritySessionsSection from "@/components/account/SecuritySessionsSection";
import EmailPreferencesSection from "@/components/account/EmailPreferencesSection";
import BillingDetailsCard from "@/components/account/BillingDetailsCard";
import ConnectedLoginsCard from "@/components/account/ConnectedLoginsCard";
import ChangeEmailCard from "@/components/account/ChangeEmailCard";
import SupportSection from "@/components/support/SupportSection";
import { QuickHelpPanel } from "@/components/support/QuickHelpPanel";
import { SupportAccessCard } from "@/components/support/SupportAccessCard";
import { SupportActivityPanel } from "@/components/support/SupportActivityPanel";
import { CancellationSaveDialog } from "@/components/account/CancellationSaveDialog";
import { useTranslation } from "react-i18next";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import { useOrg } from "@/hooks/use-org";
import { useOrgRole } from "@/hooks/use-user-role";

export default function Account() {
  const { orgId } = useOrg();
  const { isOrgAdmin, loading: roleLoading } = useOrgRole(orgId);
  const canSeeBilling = isOrgAdmin || roleLoading; // hide once role resolves to non-admin
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "profile";
  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    if (v !== "support") next.delete("ticket");
    setSearchParams(next, { replace: true });
  };
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const [fullName, setFullName] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);

  if (profile && !nameLoaded) {
    setFullName(profile.full_name || "");
    setNameLoaded(true);
  }

  const updateProfile = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast({ title: "Profile updated" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password updated successfully" });
      setNewPassword("");
      setConfirmPassword("");
      // Fire-and-forget security alert to confirm the change.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          supabase.functions.invoke("notify-account-event", {
            body: { eventType: "password_changed" },
          }).catch(() => { /* ignore */ });
        }
      } catch { /* ignore */ }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">{t("account.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("account.subtitle")}
      </p>

      <Tabs value={tab} onValueChange={setTab} className="max-w-4xl">
        <TabsList className="mb-4">
          <TabsTrigger value="profile" className="text-xs sm:text-sm">Profile & Billing</TabsTrigger>
          <TabsTrigger value="security" className="text-xs sm:text-sm">Security</TabsTrigger>
          <TabsTrigger value="support" className="text-xs sm:text-sm">Support</TabsTrigger>
        </TabsList>

        <TabsContent value="security">
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChangeEmailCard />
              <ConnectedLoginsCard />
            </div>
            <SecuritySessionsSection />
          </div>
        </TabsContent>

        <TabsContent value="support">
          <div className="space-y-4">
            <QuickHelpPanel />
            <div className="grid gap-4 lg:grid-cols-2">
              <SupportSection />
            </div>
            <SupportAccessCard />
            <SupportActivityPanel />
          </div>
        </TabsContent>

        <TabsContent value="profile">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" /> {t("account.profile")}
            </CardTitle>
            <CardDescription>{t("account.profileDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="account-email" className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> {t("account.email")}
              </Label>
              <Input id="account-email" value={user?.email || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-full-name" className="text-xs">{t("account.fullName")}</Label>
              <Input
                id="account-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("account.yourName")}
                disabled={isLoading}
              />
            </div>
            <Button
              size="sm"
              onClick={() => updateProfile.mutate(fullName)}
              disabled={updateProfile.isPending || isLoading}
            >
              {updateProfile.isPending ? t("account.saving") : t("account.saveChanges")}
            </Button>
          </CardContent>
        </Card>

        {/* Password Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" /> {t("account.changePassword")}
            </CardTitle>
            <CardDescription>{t("account.changePasswordDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Honeypot fields to absorb browser autofill before real password inputs */}
            <input type="text" name="username" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden="true" />
            <input type="password" name="password" autoComplete="current-password" className="hidden" tabIndex={-1} aria-hidden="true" />
            <div className="space-y-1.5">
              <Label htmlFor="account-new-password" className="text-xs">{t("account.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="account-new-password"
                  name="account-new-password"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("account.minCharacters")}
                  className="pr-9"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                />
                <button type="button" onClick={() => setShowNew(!showNew)} aria-label={showNew ? "Hide new password" : "Show new password"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-confirm-password" className="text-xs">{t("account.confirmPassword")}</Label>
              <div className="relative">
                <Input
                  id="account-confirm-password"
                  name="account-confirm-password"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-9"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} aria-label={showConfirm ? "Hide password confirmation" : "Show password confirmation"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handlePasswordChange}
              disabled={changingPassword || !newPassword}
            >
              {changingPassword ? t("account.updating") : t("account.updatePassword")}
            </Button>
          </CardContent>
        </Card>

        {/* Billing Address Card — admins only */}
        {canSeeBilling && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> Billing Address
            </CardTitle>
            <CardDescription>Collected from your payment details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile?.address_line1 ? (
              <div className="text-sm space-y-1">
                <p className="font-medium">{profile.full_name}</p>
                <p className="text-muted-foreground">{profile.address_line1}</p>
                {profile.address_line2 && <p className="text-muted-foreground">{profile.address_line2}</p>}
                <p className="text-muted-foreground">
                  {[profile.city, profile.state, profile.postal_code].filter(Boolean).join(", ")}
                </p>
                {profile.country && <p className="text-muted-foreground">{profile.country}</p>}
                {profile.phone && <p className="text-muted-foreground">{profile.phone}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No billing address on file. This is automatically populated from your Stripe payment details.
              </p>
            )}
          </CardContent>
        </Card>
        )}
        {/* Email Preferences */}
        <EmailPreferencesSection />

        {/* Two-Factor Authentication */}
        <TwoFactorSection />

        {/* Team Members — admins only */}
        {canSeeBilling && <TeamSection />}

        {/* Billing Details — admins only */}
        {canSeeBilling && <BillingDetailsCard />}

        {/* Subscription Management — admins only */}
        {canSeeBilling && (
        <Card className="lg:col-span-2">
          <Collapsible>
            <CardHeader className="pb-3">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-left group">
                <CardTitle className="text-base">{t("account.subscriptionManagement", "Subscription")}</CardTitle>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <CancelSubscriptionSection />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
        )}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CancelSubscriptionSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showCancel, setShowCancel] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: orgRow } = useQuery({
    queryKey: ["org_for_cancel", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("org_users").select("org_id").eq("user_id", user!.id).limit(1).maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const orgId = orgRow?.org_id;

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) {
        // Extract the real error from the response body
        const body = error?.context?.body ? await new Response(error.context.body).json().catch(() => null) : null;
        throw new Error(body?.error || error.message);
      }
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (e: any) {
      toast({ title: "Unable to open billing portal", description: e.message, variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancelNow = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription");
      if (error) {
        const body = error?.context?.body ? await new Response(error.context.body).json().catch(() => null) : null;
        throw new Error(body?.error || error.message);
      }
      if (data?.success) {
        toast({ title: "Subscription cancelled", description: "Your subscription has been cancelled immediately." });
        queryClient.invalidateQueries({ queryKey: ["subscription_status"] });
        setShowCancel(false);
        setShowConfirmCancel(false);
      } else {
        throw new Error(data?.error || "Cancellation failed");
      }
    } catch (e: any) {
      toast({ title: "Error cancelling subscription", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!showCancel) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Manage your billing and subscription details.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenPortal} disabled={portalLoading} className="gap-1.5">
            {portalLoading ? "Opening…" : "Manage Billing"}
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (orgId ? setShowSaveDialog(true) : setShowCancel(true))}
            className="text-xs text-muted-foreground"
          >
            Cancel subscription
          </Button>
        </div>
        {orgId && (
          <CancellationSaveDialog
            open={showSaveDialog}
            onOpenChange={setShowSaveDialog}
            orgId={orgId}
            onConfirmCancel={handleCancelNow}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!showConfirmCancel ? (
        <>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to cancel? Your subscription will end immediately and your data will be retained for 30 days.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => setShowConfirmCancel(true)}>
              Cancel Now
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCancel(false)}>
              Never mind
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-destructive">
            This action cannot be undone. Your subscription will be cancelled immediately.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={handleCancelNow} disabled={loading}>
              {loading ? "Cancelling…" : "Yes, cancel my subscription"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowConfirmCancel(false); setShowCancel(false); }}>
              Keep my subscription
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
