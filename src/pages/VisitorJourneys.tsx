import { useState } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { useOrg } from "@/hooks/use-org";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { VisitorJourneysList } from "@/components/journeys/VisitorJourneysList";
import { VisitorJourneyStats } from "@/components/journeys/VisitorJourneyStats";
import { HowToButton } from "@/components/HowToButton";
import { HOWTO_VISITOR_JOURNEYS } from "@/components/howto/page-content";
import { Badge } from "@/components/ui/badge";

export default function VisitorJourneys() {
  const { orgId, orgName } = useOrg();
  const [days, setDays] = useState<number | null>(30);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);

  const rangeDays = days ?? 30;
  const endDate = customRange
    ? format(startOfDay(customRange.to), "yyyy-MM-dd")
    : format(startOfDay(new Date()), "yyyy-MM-dd");
  const startDate = customRange
    ? format(startOfDay(customRange.from), "yyyy-MM-dd")
    : format(subDays(startOfDay(new Date()), rangeDays), "yyyy-MM-dd");

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Visitor Journeys</h1>
            <Badge variant="outline" className="text-xs uppercase tracking-wider px-1.5 py-0 h-4 text-primary border-primary/30">
              Beta
            </Badge>
            <HowToButton {...HOWTO_VISITOR_JOURNEYS} />
          </div>
          <p className="text-sm text-muted-foreground">
            {orgName} · See where every visitor arrived -from-, what they viewed, and where they left.
          </p>
        </div>
        <DateRangeSelector
          selectedDays={days}
          onDaysChange={(d) => { setDays(d); setCustomRange(null); }}
          customRange={customRange}
          onCustomRangeChange={(r) => { setCustomRange(r); setDays(null); }}
        />
      </div>

      <VisitorJourneyStats orgId={orgId} startDate={startDate} endDate={endDate} />

      <VisitorJourneysList orgId={orgId} startDate={startDate} endDate={endDate} />
    </div>
  );
}
