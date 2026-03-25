import { createContext, useContext, useState, useEffect } from "react";
import { useOrgs } from "@/hooks/use-dashboard-data";
import { useAuth } from "@/hooks/use-auth";

interface OrgContextValue {
  orgId: string | null;
  orgName: string | null;
  orgs: Array<{ id: string; name: string; timezone: string }>;
  setOrgId: (id: string) => void;
  loading: boolean;
}

const OrgContext = createContext<OrgContextValue>({
  orgId: null,
  orgName: null,
  orgs: [],
  setOrgId: () => {},
  loading: true,
});

function isPreviewEnvironment() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.includes("lovableproject.com") || host.includes("id-preview--");
}

const PREVIEW_FALLBACK_ORG = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Preview Workspace",
  timezone: "UTC",
};

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, user } = useAuth();
  const { data: orgs, status } = useOrgs();
  const [orgId, setOrgId] = useState<string | null>(null);
  const previewBypass = isPreviewEnvironment();

  // Only use preview fallback if user is not authenticated AND no orgs loaded
  const effectiveOrgs = previewBypass && !user && (!orgs || orgs.length === 0)
    ? [PREVIEW_FALLBACK_ORG]
    : (orgs ?? []);

  // In editor preview without auth, bypass gating. With auth, wait for orgs query.
  const isReady = previewBypass && !user
    ? !authLoading
    : (!authLoading && !!user && status === "success");

  useEffect(() => {
    if (effectiveOrgs.length > 0 && !orgId) {
      const saved = localStorage.getItem("mm_active_org");
      const match = effectiveOrgs.find((o) => o.id === saved);
      setOrgId(match ? match.id : effectiveOrgs[0].id);
    }
  }, [effectiveOrgs, orgId]);

  const handleSetOrg = (id: string) => {
    setOrgId(id);
    localStorage.setItem("mm_active_org", id);
  };

  const org = effectiveOrgs.find((o) => o.id === orgId) ?? null;

  return (
    <OrgContext.Provider
      value={{
        orgId,
        orgName: org?.name ?? null,
        orgs: effectiveOrgs,
        setOrgId: handleSetOrg,
        loading: !isReady,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
