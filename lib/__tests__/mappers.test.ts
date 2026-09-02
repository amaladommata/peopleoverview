import { describe, expect, it } from "vitest";
import { computePipSummary, mapConnectRow, mapPipCaseRow, mapProbationRow, mapResignationRow } from "../mappers";
import { serialToDate } from "../serial-date";

// Serial for 2026-08-10 and 2026-09-15, matching the live sheet's RAD/LWD
// columns on the "Resignations - August" tab (no explicit Status column —
// status is derived, see lib/types.ts and mapResignationRow).
const RAD_SERIAL = 46247; // 2026-08-10
const LWD_FUTURE_SERIAL = 46283; // 2026-09-15
const LWD_PAST_SERIAL = 46150; // 2026-05-05

describe("mapResignationRow — derived status from RAD/LWD", () => {
  const now = new Date(Date.UTC(2026, 8, 2)); // 2026-09-02, matches the live sheet's "Today"

  it("derives Serving Notice when LWD is in the future", () => {
    const row = mapResignationRow(
      { "Employee ID": "MM1", "Employee Name": "A", RAD: RAD_SERIAL, LWD: LWD_FUTURE_SERIAL },
      now
    );
    expect(row.status).toBe("Serving Notice");
    expect(row.resignationDate).toEqual(serialToDate(RAD_SERIAL));
    expect(row.expectedLwd).toEqual(serialToDate(LWD_FUTURE_SERIAL));
    expect(row.withdrawalDate).toBeNull();
  });

  it("derives Converted to Exit once LWD has passed", () => {
    const row = mapResignationRow({ "Employee ID": "MM2", "Employee Name": "B", RAD: RAD_SERIAL, LWD: LWD_PAST_SERIAL }, now);
    expect(row.status).toBe("Converted to Exit");
  });

  it("status is null with no LWD at all", () => {
    const row = mapResignationRow({ "Employee ID": "MM3", "Employee Name": "C", RAD: RAD_SERIAL }, now);
    expect(row.status).toBeNull();
  });
});

describe("computePipSummary — derived from case rows, no sheet summary block", () => {
  const now = new Date(Date.UTC(2026, 8, 2));

  it("counts active vs closed and computes success rate", () => {
    const cases = [
      mapPipCaseRow({ "Employee Name": "A", Status: "Active", "PIP Start Date": 46200 }),
      mapPipCaseRow({ "Employee Name": "B", Status: "Closed - Success" }),
      mapPipCaseRow({ "Employee Name": "C", Status: "Closed - Extended" }),
    ];
    const summary = computePipSummary(cases, now);
    expect(summary.totalActive).toBe(1);
    expect(summary.closedSuccess).toBe(1);
    expect(summary.closedExtended).toBe(1);
    expect(summary.successRate).toBeCloseTo(50, 5);
  });

  it("successRate is null when nothing is closed yet", () => {
    const cases = [mapPipCaseRow({ "Employee Name": "A", Status: "Active" })];
    const summary = computePipSummary(cases, now);
    expect(summary.successRate).toBeNull();
  });
});

describe("mapConnectRow / mapProbationRow", () => {
  it("maps a valid RED/AMBER/GREEN marking", () => {
    const row = mapConnectRow({ MMID: "MM1", "Full name": "A", "HRBP EWS Marking": "red" });
    expect(row.ewsMarking).toBe("RED");
  });

  it("maps an unrecognized marking to null rather than a garbage string", () => {
    const row = mapConnectRow({ MMID: "MM1", "Full name": "A", "HRBP EWS Marking": "" });
    expect(row.ewsMarking).toBeNull();
  });

  it("reads the Probation tab's literal newline header via fallback", () => {
    const row = mapProbationRow({
      "Employee ID": "MM1",
      "Employee Name": "A",
      "Probation \nEnd Date": 46200,
    });
    expect(row.probationEndDate).toEqual(serialToDate(46200));
  });
});
