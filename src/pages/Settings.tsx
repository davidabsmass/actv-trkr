import { useOrg } from "@/hooks/use-org";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ApiKeysSection from "@/components/settings/ApiKeysSection";
import SitesSection from "@/components/settings/SitesSection";
import PluginSection from "@/components/settings/PluginSection";
import FormsSection from "@/components/settings/FormsSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import WebsiteSetup from "@/pages/WebsiteSetup";
import GetStartedGuide from "@/components/onboarding/GetStartedGuide";
import WhiteLabelSection from "@/components/settings/WhiteLabelSection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function SettingsPage() {
  const { orgName, orgId } = useOrg();
  const { isAdmin } = useUserRole();
  const { isOrgAdmin } = useOrgRole(orgId);
  const showAdminSections = isAdmin || isOrgAdmin;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "general";
  const { t } = useTranslation();

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">{t("settings.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("settings.configFor", { orgName })}
      </p>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">{t("settings.general")}</TabsTrigger>
          {showAdminSections && <TabsTrigger value="white-label">{t("settings.whiteLabel")}</TabsTrigger>}
          <TabsTrigger value="setup">{t("settings.websiteSetup")}</TabsTrigger>
          <TabsTrigger value="guide">{t("settings.getStarted")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-4 lg:grid-cols-2">
            {showAdminSections && <PluginSection />}
            {showAdminSections && <ApiKeysSection />}
            <SitesSection />
            <FormsSection />
            <NotificationsSection />
          </div>
        </TabsContent>

        {showAdminSections && (
          <TabsContent value="white-label">
            <WhiteLabelSection />
          </TabsContent>
        )}

        <TabsContent value="setup">
          <WebsiteSetup />
        </TabsContent>

        <TabsContent value="guide">
          <GetStartedGuide compact />
        </TabsContent>
      </Tabs>
    </div>
  );
}
