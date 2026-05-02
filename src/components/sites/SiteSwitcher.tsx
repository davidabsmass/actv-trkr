import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Globe, Plus, Circle } from "lucide-react";
import { useOrg } from "@/hooks/use-org";
import { useSites } from "@/hooks/use-dashboard-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddSiteModal } from "./AddSiteModal";

type SiteStatusKind = "active" | "no_data" | "disconnected";

function deriveStatus(site: {
  status?: string | null;
  last_heartbeat_at?: string | null;
}): { kind: SiteStatusKind; label: string } {
  const status = (site.status ?? "").toUpperCase();
  if (status === "DOWN" || status === "DISCONNECTED" || status === "ARCHIVED") {
    return { kind: "disconnected", label: "Disconnected" };
  }
  if (!site.last_heartbeat_at) {
    return { kind: "no_data", label: "No data yet" };
  }
  // Stale heartbeat: treat as not connected
  const lastMs = new Date(site.last_heartbeat_at).getTime();
  if (Number.isFinite(lastMs) && Date.now() - lastMs > 24 * 60 * 60 * 1000) {
    return { kind: "disconnected", label: "Disconnected" };
  }
  return { kind: "active", label: "Active" };
}

function StatusDot({ kind }: { kind: SiteStatusKind }) {
  const color =
    kind === "active"
      ? "text-success"
      : kind === "no_data"
      ? "text-warning"
      : "text-destructive";
  return <Circle className={`h-2 w-2 fill-current ${color}`} />;
}

export function SiteSwitcher() {
  const { orgId } = useOrg();
  const { data: sites } = useSites(orgId);
  const [addOpen, setAddOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const list = sites ?? [];
  const isFirstSite = list.length === 0;

  // Determine the "current" site: URL ?site= param if present, else first site
  const siteParam = searchParams.get("site");
  const currentSite =
    list.find((s) => s.id === siteParam) ?? list[0] ?? null;
  const currentLabel = currentSite
    ? currentSite.display_name || currentSite.name || currentSite.domain
    : null;

  // Dropdown trigger label: count when multiple, single name otherwise
  const summary =
    list.length === 0
      ? "No sites yet"
      : list.length === 1
      ? list[0].display_name || list[0].name || list[0].domain
      : `${list.length} sites`;

  return (
    <>
      {currentLabel && (
        <div className="px-1 mt-2 mb-0.5">
          <p className="text-[10px] uppercase tracking-wider text-white/40">Current site</p>
          <p className="text-xs font-semibold text-white truncate" title={currentLabel}>
            {currentLabel}
          </p>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center justify-between px-3 py-2 mt-1 text-xs font-medium bg-white/10 rounded-md text-white/90 hover:bg-white/20 transition-colors">
            <span className="flex items-center gap-2 min-w-0">
              <Globe className="h-3 w-3 flex-shrink-0 text-white/60" />
              <span className="truncate">{summary}</span>
            </span>
            <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0 text-white/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Connected sites
          </DropdownMenuLabel>
          {list.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No sites connected yet.
            </div>
          ) : (
            list.map((site) => {
              const status = deriveStatus(site);
              const label = site.display_name || site.name || site.domain;
              return (
                <DropdownMenuItem
                  key={site.id}
                  onSelect={() => navigate(`/monitoring?site=${site.id}`)}
                  className="flex items-start gap-2 py-2 focus:text-accent-foreground [&:focus_*]:!text-accent-foreground data-[highlighted]:text-accent-foreground [&[data-highlighted]_*]:!text-accent-foreground"
                >
                  <StatusDot kind={status.kind} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{label}</div>
                    <div className="text-xs text-muted-foreground truncate">{site.domain}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{status.label}</div>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setAddOpen(true);
            }}
            className="text-primary gap-2 focus:text-accent-foreground data-[highlighted]:text-accent-foreground"
          >
            <Plus className="h-4 w-4" />
            Add another site
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddSiteModal open={addOpen} onOpenChange={setAddOpen} isFirstSite={isFirstSite} />
    </>
  );
}
