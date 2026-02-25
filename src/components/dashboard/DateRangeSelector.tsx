import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";

const presets = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

interface DateRangeSelectorProps {
  selectedDays: number;
  onDaysChange: (days: number) => void;
}

export function DateRangeSelector({ selectedDays, onDaysChange }: DateRangeSelectorProps) {
  const [open, setOpen] = useState(false);
  const current = presets.find((p) => p.days === selectedDays) || presets[2];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-secondary text-foreground rounded-md border border-border hover:bg-accent transition-colors"
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        {current.label}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
            {presets.map((preset) => (
              <button
                key={preset.days}
                onClick={() => {
                  onDaysChange(preset.days);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  preset.days === selectedDays
                    ? "text-primary font-semibold bg-primary/5"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
