import { useState } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { useOrg } from "@/hooks/use-org";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { VisitorJourneysList } from "@/components/journeys/VisitorJourneysList";

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
          <h1 className="text-2xl font-bold text-foreground">Visitor Journeys</h1>
          <p className="text-sm text-muted-foreground">
            {orgName} · See where every visitor arrived, what they viewed, and where they left.
          </p>
        </div>
        <DateRangeSelector
          selectedDays={days}
          onDaysChange={(d) => { setDays(d); setCustomRange(null); }}
          customRange={customRange}
          onCustomRangeChange={(r) => { setCustomRange(r); setDays(null); }}
        />
      </div>

      <VisitorJourneysList orgId={orgId} startDate={startDate} endDate={endDate} />
    </div>
  );
}
