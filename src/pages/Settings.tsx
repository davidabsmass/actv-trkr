import { useOrg } from "@/hooks/use-org";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ApiKeysSection from "@/components/settings/ApiKeysSection";
import SitesSection from "@/components/settings/SitesSection";
import PluginSection from "@/components/settings/PluginSection";
import SyncStatusCard from "@/components/settings/SyncStatusCard";
import SeoVisibilitySection from "@/components/settings/SeoVisibilitySection";
import NotificationsHub from "@/components/settings/NotificationsHub";
import WebsiteSetup from "@/pages/WebsiteSetup";
import AddSite from "@/pages/AddSite";
import FormImportPanel from "@/components/settings/FormImportPanel";
import FormsSection from "@/components/settings/FormsSection";
import GoalsSection from "@/components/settings/GoalsSection";
import { SettingsConnectingNotice } from "@/components/settings/SettingsConnectingNotice";

import WhiteLabelSection from "@/components/settings/WhiteLabelSection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HowToButton } from "@/components/HowToButton";
import { HOWTO_SETTINGS } from "@/components/howto/page-content";
import { useEffect } from "react";

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
      <div className="flex items-center gap-1.5 mb-1">
        <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
        <HowToButton {...HOWTO_SETTINGS} />
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {t("settings.configFor", { orgName })}
      </p>

      <SettingsConnectingNotice />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="general" className="flex-shrink-0 text-xs sm:text-sm">{t("settings.general")}</TabsTrigger>
          <TabsTrigger value="goals" className="flex-shrink-0 text-xs sm:text-sm">Goals</TabsTrigger>
          <TabsTrigger value="notifications" className="flex-shrink-0 text-xs sm:text-sm">Notifications</TabsTrigger>
          <TabsTrigger value="white-label" className="flex-shrink-0 text-xs sm:text-sm">{t("settings.whiteLabel")}</TabsTrigger>
          <TabsTrigger value="setup" className="flex-shrink-0 text-xs sm:text-sm">{t("settings.websiteSetup")}</TabsTrigger>
          {activeTab === "add-site" && (
            <TabsTrigger value="add-site" className="flex-shrink-0 text-xs sm:text-sm">Add Site</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-4 lg:grid-cols-2">
            {showAdminSections && <PluginSection />}
            <SyncStatusCard />
            {showAdminSections && <ApiKeysSection />}
            <SitesSection />
            <SeoVisibilitySection />
            <FormsSection />
            {showAdminSections && <FormImportPanel />}
          </div>
        </TabsContent>

        <TabsContent value="goals">
          <div className="grid gap-4 lg:grid-cols-2">
            <GoalsSection />
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationsHub />
        </TabsContent>

        <TabsContent value="white-label">
          <WhiteLabelSection />
        </TabsContent>

        <TabsContent value="setup">
          <WebsiteSetup />
        </TabsContent>

        <TabsContent value="add-site">
          <AddSite />
        </TabsContent>

      </Tabs>
    </div>
  );
}
