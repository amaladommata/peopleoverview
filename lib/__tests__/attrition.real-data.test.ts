import { describe, expect, it } from "vitest";
import { computePeriodMetrics } from "../attrition";
import { buildRoster, rowsToRecords } from "../mappers";
import realExport from "../__fixtures__/august-2026-real-sheet-export.json";

// This fixture is a direct row/serial-date export of the real
// Alekhya_August_HRBP_Tracker workbook's Headcount Overview (553 rows) and
// Attrition Tracker (6 rows) tabs, taken 2026-08-26. It exercises the exact
// same rowsToRecords -> buildRoster -> computePeriodMetrics pipeline the
// live API routes use, so passing this test is the Phase 1 verification
// the kickoff prompt required before touching any UI.

const headcountRecords = rowsToRecords(realExport.headcount.header, realExport.headcount.rows);
const attritionRecords = rowsToRecords(realExport.attrition.header, realExport.attrition.rows);
const roster = buildRoster(headcountRecords, attritionRecords);

const AUGUST_START = new Date(Date.UTC(2026, 7, 1));
const AUGUST_END = new Date(Date.UTC(2026, 7, 31));

describe("computePeriodMetrics against the real August 2026 sheet export", () => {
  it("reconstructs the active roster to 553 people and 6 exits", () => {
    expect(headcountRecords.length).toBe(553);
    expect(attritionRecords.length).toBe(6);
  });

  it("matches the kickoff's known values: 553 closing HC, 6 exits, for the full org", () => {
    const metrics = computePeriodMetrics(roster, [], {}, AUGUST_START, AUGUST_END);

    expect(metrics.closingHeadcount).toBe(553);
    expect(metrics.exits).toBe(6);
    // All 6 known exits are voluntary (verified against the raw sheet).
    expect(metrics.voluntaryExits).toBe(6);
    expect(metrics.involuntaryExits).toBe(0);
  });

  it("opening + hires - exits reconciles to closing (internal consistency check)", () => {
    const metrics = computePeriodMetrics(roster, [], {}, AUGUST_START, AUGUST_END);
    expect(metrics.openingHeadcount + metrics.hires - metrics.exits).toBe(metrics.closingHeadcount);
  });

  it("computes attrition % using exits / avg(opening, closing) — PRD §5.2", () => {
    const metrics = computePeriodMetrics(roster, [], {}, AUGUST_START, AUGUST_END);
    const expectedPct =
      (metrics.exits / ((metrics.openingHeadcount + metrics.closingHeadcount) / 2)) * 100;
    expect(metrics.attritionPct).toBeCloseTo(expectedPct, 10);
  });

  it("scopes opening/closing HC and exits together, not just the exit count (the Looker Studio bug this rebuild fixes)", () => {
    const all = computePeriodMetrics(roster, [], {}, AUGUST_START, AUGUST_END);
    const hulu = computePeriodMetrics(roster, [], { client: "Hulu" }, AUGUST_START, AUGUST_END);

    // Hulu is a strict, non-trivial subset of the full org on every axis.
    expect(hulu.closingHeadcount).toBeGreaterThan(0);
    expect(hulu.closingHeadcount).toBeLessThan(all.closingHeadcount);
    expect(hulu.exits).toBeGreaterThan(0);
    expect(hulu.exits).toBeLessThanOrEqual(all.exits);

    // Every exit row returned for the Hulu scope must actually belong to Hulu —
    // proves the exit rows and the headcount denominator share the same filter.
    for (const row of hulu.exitRows) {
      expect(row.client).toBe("Hulu");
    }

    // Hulu's attrition % must be independently derivable from Hulu's own
    // opening/closing/exits, not the global average headcount.
    const expectedHuluPct =
      (hulu.exits / ((hulu.openingHeadcount + hulu.closingHeadcount) / 2)) * 100;
    expect(hulu.attritionPct).toBeCloseTo(expectedHuluPct, 10);
  });

  it("resignation fields are null when no resignation dates exist (PRD §4, §10.1 blocker)", () => {
    const metrics = computePeriodMetrics(roster, [], {}, AUGUST_START, AUGUST_END);
    expect(metrics.resignationsReceived).toBeNull();
    expect(metrics.resignationsWithdrawn).toBeNull();
    expect(metrics.inNoticePipeline).toBeNull();
  });
});
