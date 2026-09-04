import { dateToString } from "./format";

export type ReportDuration = "current_month" | "last_month" | "last_3_months" | "last_6_months" | "current_year" | "custom";

export const DURATION_OPTIONS: { value: ReportDuration; label: string }[] = [
  { value: "current_month", label: "Current Month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 month" },
  { value: "last_6_months", label: "Last 6 month" },
  { value: "current_year", label: "Current Year" },
  { value: "custom", label: "Custom date range" },
];

function monthsAgoStart(date: Date, monthsBack: number): Date {
  return new Date(date.getFullYear(), date.getMonth() - monthsBack, 1);
}

/**
 * Computes the [from, to] range for every preset duration except "custom" --
 * that one has no fixed range, the caller collects From/To separately.
 * "Last N months" is a rolling window ending today, starting from the 1st
 * of the month (N-1) months back, so it always includes the current month.
 */
export function getDurationRange(duration: Exclude<ReportDuration, "custom">, today: Date = new Date()): { from: string; to: string } {
  const to = dateToString(today);
  switch (duration) {
    case "current_month":
      return { from: dateToString(new Date(today.getFullYear(), today.getMonth(), 1)), to };
    case "last_month": {
      const lastMonthStart = monthsAgoStart(today, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: dateToString(lastMonthStart), to: dateToString(lastMonthEnd) };
    }
    case "last_3_months":
      return { from: dateToString(monthsAgoStart(today, 2)), to };
    case "last_6_months":
      return { from: dateToString(monthsAgoStart(today, 5)), to };
    case "current_year":
      return { from: dateToString(new Date(today.getFullYear(), 0, 1)), to };
  }
}
