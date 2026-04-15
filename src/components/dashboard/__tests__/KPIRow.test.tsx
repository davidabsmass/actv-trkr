import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { KPICard } from "../KPIRow";

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "dashboard.noChange": "No change",
        "dashboard.strongGrowth": "Strong growth",
        "dashboard.attentionNeeded": "Attention needed",
      };
      return map[key] || key;
    },
  }),
}));

describe("KPICard", () => {
  it("renders label and value", () => {
    render(<KPICard label="Sessions" value="1,234" delta={null} />);
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("shows dash for null delta", () => {
    render(<KPICard label="Sessions" value="100" delta={null} />);
    expect(screen.queryByText("—")).not.toBeInTheDocument(); // null delta hides the row
  });

  it("shows positive delta text", () => {
    render(<KPICard label="Leads" value="50" delta={0.08} />);
    expect(screen.getByText("+8.0%")).toBeInTheDocument();
  });

  it("shows strong growth for delta > 15%", () => {
    render(<KPICard label="Leads" value="50" delta={0.2} />);
    expect(screen.getByText("Strong growth")).toBeInTheDocument();
  });

  it("shows attention needed for large negative", () => {
    render(<KPICard label="Leads" value="50" delta={-0.2} />);
    expect(screen.getByText("Attention needed")).toBeInTheDocument();
  });

  it("shows no change for tiny delta", () => {
    render(<KPICard label="Leads" value="50" delta={0.005} />);
    expect(screen.getByText("No change")).toBeInTheDocument();
  });

  it("renders suffix", () => {
    render(<KPICard label="CVR" value="3.2" delta={0.05} suffix="%" />);
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("renders subtext", () => {
    render(<KPICard label="CVR" value="3.2" delta={null} subtext="10 of 300 sessions" />);
    expect(screen.getByText("10 of 300 sessions")).toBeInTheDocument();
  });
});
