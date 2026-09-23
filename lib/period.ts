import { FY_START_MONTH } from "@/config/constants";
import { PeriodPreset } from "./types";

export interface DateRange {
  start: Date;
  end: Date;
}

function utcMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function endOfToday(now: Date): Date {
  return utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// ISO week (Mon–Sun) containing `now`.
function isoWeekRange(now: Date): DateRange {
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  const isoDay = day === 0 ? 7 : day; // 1=Mon..7=Sun
  const monday = new Date(now.getTime() - (isoDay - 1) * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return {
    start: utcMidnight(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
    end: utcMidnight(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate()),
  };
}

function monthRange(now: Date): DateRange {
  const start = utcMidnight(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return { start, end: endOfToday(now) };
}

// FY_START_MONTH is 1-indexed (4 = April). If we're before that month in the
// calendar year, the FY started in the previous calendar year.
function ytdRange(now: Date): DateRange {
  const fyMonthIndex = FY_START_MONTH - 1; // 0-indexed for Date.UTC
  const currentMonthIndex = now.getUTCMonth();
  const fyStartYear = currentMonthIndex >= fyMonthIndex ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const start = utcMidnight(fyStartYear, fyMonthIndex, 1);
  return { start, end: endOfToday(now) };
}

export function resolvePeriod(
  preset: PeriodPreset,
  custom?: { start: Date; end: Date },
  now: Date = new Date()
): DateRange {
  switch (preset) {
    case "week":
      return isoWeekRange(now);
    case "month":
      return monthRange(now);
    case "ytd":
      return ytdRange(now);
    case "custom":
      if (!custom) throw new Error("custom period requires a start/end range");
      return custom;
  }
}

// Always the calendar-month range containing `now`, regardless of the
// period switcher — used for the fixed "MTD" column in data-cut tables.
export function mtdRange(now: Date = new Date()): DateRange {
  return monthRange(now);
}

// Always Apr 1 (FY start) -> today, regardless of the period switcher —
// used for the fixed "YTD" column that drives default sort order.
export function ytdFixedRange(now: Date = new Date()): DateRange {
  return ytdRange(now);
}

export interface MonthBucket {
  label: string; // e.g. "Aug 2026"
  year: number;
  monthIndex: number; // 0-indexed
  start: Date;
  end: Date; // last day of that month, or today if it's the current month
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Trailing `count` months ending with the current month, each scoped to its
// own [1st, last-day-or-today] range — feeds the monthly summary table and
// trend charts (PRD §7.3/§7.5), independent of the period switcher.
export function trailingMonths(count: number, now: Date = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const monthIndex = d.getUTCMonth();
    const start = utcMidnight(year, monthIndex, 1);
    const isCurrentMonth = year === now.getUTCFullYear() && monthIndex === now.getUTCMonth();
    const end = isCurrentMonth ? endOfToday(now) : utcMidnight(year, monthIndex + 1, 0);
    buckets.push({ label: `${MONTH_LABELS[monthIndex]} ${year}`, year, monthIndex, start, end });
  }
  return buckets;
}
