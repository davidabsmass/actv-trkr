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
import { useTranslation } from "react-i18next";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function Account() {
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

      <div className="grid gap-4 lg:grid-cols-2 max-w-4xl">
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
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> {t("account.email")}
              </Label>
              <Input value={user?.email || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("account.fullName")}</Label>
              <Input
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

        {/* Billing Address Card */}
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
        {/* Password Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" /> {t("account.changePassword")}
            </CardTitle>
            <CardDescription>{t("account.changePasswordDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("account.newPassword")}</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("account.minCharacters")}
                  className="pr-9"
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("account.confirmPassword")}</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-9"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
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
        {/* Subscription Management */}
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
      </div>
    </div>
  );
}

function CancelSubscriptionSection() {
  const { toast } = useToast();
  const [showCancel, setShowCancel] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
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
      if (error) throw error;
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
          <Button variant="outline" size="sm" onClick={() => setShowCancel(true)} className="text-xs text-muted-foreground">
            Cancel subscription
          </Button>
        </div>
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
