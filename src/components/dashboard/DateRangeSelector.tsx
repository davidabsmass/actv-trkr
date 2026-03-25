import { useState } from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";

interface DateRangeSelectorProps {
  selectedDays: number | null;
  onDaysChange: (days: number) => void;
  customRange?: { from: Date; to: Date } | null;
  onCustomRangeChange?: (range: { from: Date; to: Date }) => void;
}

export function DateRangeSelector({ selectedDays, onDaysChange, customRange, onCustomRangeChange }: DateRangeSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(
    customRange ? { from: customRange.from, to: customRange.to } : undefined
  );

  const presets = [
    { label: t("dateRange.last7"), days: 7 },
    { label: t("dateRange.last14"), days: 14 },
    { label: t("dateRange.last30"), days: 30 },
    { label: t("dateRange.last90"), days: 90 },
  ];

  const isCustom = selectedDays === null && customRange;
  const currentLabel = isCustom
    ? `${format(customRange!.from, "MMM d")} – ${format(customRange!.to, "MMM d")}`
    : (presets.find((p) => p.days === selectedDays) || presets[2]).label;

  const handleApplyCustom = () => {
    if (pendingRange?.from && pendingRange?.to && onCustomRangeChange) {
      onCustomRangeChange({ from: pendingRange.from, to: pendingRange.to });
      setShowCalendar(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); setShowCalendar(false); }}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-muted text-foreground rounded-md border border-border hover:bg-muted/80 transition-colors"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
        {currentLabel}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowCalendar(false); }} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
            {presets.map((preset) => (
              <button key={preset.days} onClick={() => { onDaysChange(preset.days); setShowCalendar(false); setOpen(false); }}
                className={cn("w-full text-left px-3 py-1.5 text-xs transition-colors", preset.days === selectedDays ? "text-primary font-semibold bg-primary/5" : "text-foreground hover:bg-secondary hover:text-secondary-foreground")}>
                {preset.label}
              </button>
            ))}
            <div className="border-t border-border my-1" />
            <button
              onClick={() => { setShowCalendar(true); if (!pendingRange?.from) setPendingRange({ from: new Date(), to: new Date() }); }}
              className={cn("w-full text-left px-3 py-1.5 text-xs transition-colors", isCustom ? "text-primary font-semibold bg-primary/5" : "text-foreground hover:bg-secondary hover:text-secondary-foreground")}>
              {t("dateRange.customRange")}
            </button>
            {showCalendar && (
              <div className="p-2 border-t border-border">
                <Calendar mode="range" selected={pendingRange} onSelect={setPendingRange} numberOfMonths={2} defaultMonth={pendingRange?.from || new Date()} disabled={(date) => date > new Date()}
                  className={cn("p-2 pointer-events-auto text-xs")}
                  classNames={{
                    months: "flex flex-col sm:flex-row space-y-2 sm:space-x-2 sm:space-y-0", month: "space-y-2",
                    caption: "flex justify-center pt-1 relative items-center", caption_label: "text-xs font-medium",
                    nav_button: "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-border",
                    nav_button_previous: "absolute left-0", nav_button_next: "absolute right-0",
                    table: "w-full border-collapse", head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[0.65rem]",
                    row: "flex w-full mt-1",
                    cell: "h-7 w-7 text-center text-[0.65rem] p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "h-7 w-7 p-0 font-normal aria-selected:opacity-100 inline-flex items-center justify-center rounded-md text-[0.65rem] hover:bg-secondary",
                    day_range_end: "day-range-end",
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground", day_outside: "day-outside text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50", day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground", day_hidden: "invisible",
                  }}
                />
                <div className="flex justify-end gap-2 mt-2 px-1">
                  <button onClick={() => setShowCalendar(false)} className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md">{t("dateRange.cancel")}</button>
                  <button onClick={handleApplyCustom} disabled={!pendingRange?.from || !pendingRange?.to}
                    className="px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40">{t("dateRange.apply")}</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
