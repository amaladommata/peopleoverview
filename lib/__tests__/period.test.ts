import { describe, expect, it } from "vitest";
import { mtdRange, resolvePeriod, trailingMonths, ytdFixedRange } from "../period";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

describe("resolvePeriod", () => {
  const now = d(2026, 9, 2); // matches the live sheet's "Today"

  it("week: ISO Mon-Sun containing now", () => {
    const { start, end } = resolvePeriod("week", undefined, now);
    // 2026-09-02 is a Wednesday -> week is Aug 31 - Sep 6
    expect(start).toEqual(d(2026, 8, 31));
    expect(end).toEqual(d(2026, 9, 6));
  });

  it("month: 1st of month -> today", () => {
    const { start, end } = resolvePeriod("month", undefined, now);
    expect(start).toEqual(d(2026, 9, 1));
    expect(end).toEqual(now);
  });

  it("ytd: FY start (April) -> today, same calendar year when past April", () => {
    const { start, end } = resolvePeriod("ytd", undefined, now);
    expect(start).toEqual(d(2026, 4, 1));
    expect(end).toEqual(now);
  });

  it("ytd: rolls back to previous calendar year before FY start month", () => {
    const jan = d(2027, 1, 15);
    const { start } = resolvePeriod("ytd", undefined, jan);
    expect(start).toEqual(d(2026, 4, 1));
  });

  it("custom: passes the given range through unchanged", () => {
    const custom = { start: d(2026, 1, 1), end: d(2026, 1, 31) };
    expect(resolvePeriod("custom", custom, now)).toEqual(custom);
  });

  it("custom: throws without a range", () => {
    expect(() => resolvePeriod("custom", undefined, now)).toThrow();
  });
});

describe("mtdRange / ytdFixedRange — fixed regardless of switcher", () => {
  const now = d(2026, 9, 2);

  it("mtdRange is always the current calendar month", () => {
    expect(mtdRange(now)).toEqual({ start: d(2026, 9, 1), end: now });
  });

  it("ytdFixedRange is always FY start -> today", () => {
    expect(ytdFixedRange(now)).toEqual({ start: d(2026, 4, 1), end: now });
  });
});

describe("trailingMonths", () => {
  it("returns N months ending with the current month, current month capped at today", () => {
    const now = d(2026, 9, 2);
    const months = trailingMonths(12, now);
    expect(months).toHaveLength(12);
    expect(months[0].label).toBe("Oct 2025");
    expect(months[11].label).toBe("Sep 2026");
    expect(months[11].end).toEqual(now);
    // A past month ends on its actual last day.
    const aug = months.find((m) => m.label === "Aug 2026")!;
    expect(aug.start).toEqual(d(2026, 8, 1));
    expect(aug.end).toEqual(d(2026, 8, 31));
  });
});
