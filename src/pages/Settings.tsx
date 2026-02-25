import { useOrg } from "@/hooks/use-org";

export default function SettingsPage() {
  const { orgName } = useOrg();

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configuration for {orgName}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "API Keys", desc: "Manage keys for the WordPress plugin" },
          { title: "Sites", desc: "Connected WordPress sites" },
          { title: "Forms & Mapping", desc: "Configure field mappings for lead forms" },
          { title: "URL Rules", desc: "Infer service/location from page paths" },
          { title: "Goals", desc: "Set monthly lead targets" },
          { title: "Schedules", desc: "Automated report delivery" },
        ].map((s) => (
          <div key={s.title} className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-1">{s.title}</h3>
            <p className="text-xs text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
