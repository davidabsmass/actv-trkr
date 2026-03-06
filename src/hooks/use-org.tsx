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

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, user } = useAuth();
  const { data: orgs, isFetching, status } = useOrgs();
  const [orgId, setOrgId] = useState<string | null>(null);

  // Consider loading until auth is done AND orgs query has succeeded at least once
  const isReady = !authLoading && !!user && status === "success";

  useEffect(() => {
    if (orgs && orgs.length > 0 && !orgId) {
      const saved = localStorage.getItem("mm_active_org");
      const match = orgs.find((o) => o.id === saved);
      setOrgId(match ? match.id : orgs[0].id);
    }
  }, [orgs, orgId]);

  const handleSetOrg = (id: string) => {
    setOrgId(id);
    localStorage.setItem("mm_active_org", id);
  };

  const org = orgs?.find((o) => o.id === orgId) ?? null;

  return (
    <OrgContext.Provider
      value={{
        orgId,
        orgName: org?.name ?? null,
        orgs: orgs ?? [],
        setOrgId: handleSetOrg,
        loading: !isReady,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
