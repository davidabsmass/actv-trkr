import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { Card, CardContent } from "@/components/ui/card";
import { SecurityOverviewTab } from "@/components/security/SecurityOverviewTab";
import { SecurityFindingsTab } from "@/components/security/SecurityFindingsTab";
import { SecurityEventsTab } from "@/components/security/SecurityEventsTab";
import { SecurityApiKeysTab } from "@/components/security/SecurityApiKeysTab";
import { AddSiteHeaderButton } from "@/components/sites/AddSiteHeaderButton";

export default function Security() {
  const { isAdmin, loading } = useUserRole();
  const [tab, setTab] = useState("overview");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardContent className="p-8 text-center space-y-3">
          <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">Admin access required</h2>
          <p className="text-sm text-muted-foreground">
            The Security console is restricted to organization administrators.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Risk visibility, audit trail, and release readiness for your account.
          </p>
        </div>
        <AddSiteHeaderButton />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <SecurityOverviewTab onJumpTo={setTab} />
        </TabsContent>
        <TabsContent value="findings" className="space-y-4">
          <SecurityFindingsTab />
        </TabsContent>
        <TabsContent value="events" className="space-y-4">
          <SecurityEventsTab />
        </TabsContent>
        <TabsContent value="api-keys" className="space-y-4">
          <SecurityApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
