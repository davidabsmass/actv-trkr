import { useOrg } from "@/hooks/use-org";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";
import { useSearchParams } from "react-router-dom";
import ApiKeysSection from "@/components/settings/ApiKeysSection";
import SitesSection from "@/components/settings/SitesSection";
import PluginSection from "@/components/settings/PluginSection";
import FormsSection from "@/components/settings/FormsSection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import WebsiteSetup from "@/pages/WebsiteSetup";
import GetStartedGuide from "@/components/onboarding/GetStartedGuide";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function SettingsPage() {
  const { orgName, orgId } = useOrg();
  const { isAdmin } = useUserRole();
  const { isOrgAdmin } = useOrgRole(orgId);
  const showAdminSections = isAdmin || isOrgAdmin;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "general";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configuration for {orgName}
      </p>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="setup">Website Setup</TabsTrigger>
          <TabsTrigger value="guide">Get Started</TabsTrigger>
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
