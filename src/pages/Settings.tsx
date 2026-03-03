import { useOrg } from "@/hooks/use-org";
import { useUserRole, useOrgRole } from "@/hooks/use-user-role";
import ApiKeysSection from "@/components/settings/ApiKeysSection";
import SitesSection from "@/components/settings/SitesSection";
import PluginSection from "@/components/settings/PluginSection";
import FormsSection from "@/components/settings/FormsSection";
import NotificationsSection from "@/components/settings/NotificationsSection";

export default function SettingsPage() {
  const { orgName, orgId } = useOrg();
  const { isAdmin } = useUserRole();
  const { isOrgAdmin } = useOrgRole(orgId);
  const showAdminSections = isAdmin || isOrgAdmin;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configuration for {orgName}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {showAdminSections && <PluginSection />}
        {showAdminSections && <ApiKeysSection />}
        <SitesSection />
        <FormsSection />
        <NotificationsSection />
      </div>
    </div>
  );
}
