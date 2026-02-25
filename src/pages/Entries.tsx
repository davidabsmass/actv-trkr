import { useOrg } from "@/hooks/use-org";

export default function Entries() {
  const { orgName } = useOrg();

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Entries</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Lead submissions for {orgName}
      </p>
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        Entries table coming soon — filterable, sortable, with CSV export.
      </div>
    </div>
  );
}
