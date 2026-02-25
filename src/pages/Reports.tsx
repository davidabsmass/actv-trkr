import { useOrg } from "@/hooks/use-org";

export default function Reports() {
  const { orgName } = useOrg();

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Reports</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Generate PDF reports for {orgName}
      </p>
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        Reports module coming soon — weekly briefs, monthly performance, campaign reports.
      </div>
    </div>
  );
}
