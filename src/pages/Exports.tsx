import { useOrg } from "@/hooks/use-org";

export default function Exports() {
  const { orgName } = useOrg();

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Exports</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Export data for {orgName}
      </p>
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        Exports module coming soon — CSV and XLSX downloads.
      </div>
    </div>
  );
}
