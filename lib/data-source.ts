import "server-only";
import { unstable_cache } from "next/cache";
import { fetchRange } from "./sheets-client";
import { dataRange, headerRange, SHEET_TABS } from "./sheet-tabs";
import {
  buildRoster,
  computePipSummary,
  mapConnectRow,
  mapGrievanceRow,
  mapPipCaseRow,
  mapProbationRow,
  mapResignationRow,
  rowsToRecords,
} from "./mappers";
import {
  ConnectRecord,
  Employee,
  GrievanceRecord,
  PipCase,
  PipSummary,
  ProbationRecord,
  ResignationRecord,
} from "./types";

// 60s revalidate window (Appendix §D) — keeps Sheets API calls bounded
// under repeated dashboard refreshes without baking data into the build.
// There's no push/webhook from Sheets API v4, so "auto-refresh on sheet
// update" means: re-fetched on next page load once this window has elapsed,
// not an instant push the moment someone edits a cell.
const REVALIDATE_SECONDS = 60;

async function fetchTab(tab: (typeof SHEET_TABS)[keyof typeof SHEET_TABS]) {
  const [header, rows] = await Promise.all([
    fetchRange(headerRange(tab)),
    fetchRange(dataRange(tab)),
  ]);
  return rowsToRecords(header[0] ?? [], rows);
}

// The union roster (PRD §5.1): active Headcount Overview rows + exited
// Attrition Tracker rows, so past-date headcount reconstruction is correct.
export const getRoster = unstable_cache(
  async (): Promise<Employee[]> => {
    const [headcountRows, attritionRows] = await Promise.all([
      fetchTab(SHEET_TABS.headcount),
      fetchTab(SHEET_TABS.attrition),
    ]);
    return buildRoster(headcountRows, attritionRows);
  },
  ["roster"],
  { revalidate: REVALIDATE_SECONDS }
);

export const getResignations = unstable_cache(
  async (): Promise<ResignationRecord[]> => {
    const rows = await fetchTab(SHEET_TABS.resignation);
    return rows.map((r) => mapResignationRow(r));
  },
  ["resignations"],
  { revalidate: REVALIDATE_SECONDS }
);

// The source Grievance Tracker tab doesn't exist yet (HRBP will add it to
// this same sheet later) — fail soft to [] rather than erroring the whole
// dashboard on a missing-sheet API error.
export const getGrievances = unstable_cache(
  async (): Promise<GrievanceRecord[]> => {
    try {
      const rows = await fetchTab(SHEET_TABS.grievance);
      return rows.map(mapGrievanceRow);
    } catch {
      return [];
    }
  },
  ["grievances"],
  { revalidate: REVALIDATE_SECONDS }
);

// The live "PIP" tab has no auto-calc summary block — summary is derived
// in code from the case rows (see computePipSummary).
export const getPip = unstable_cache(
  async (): Promise<{ summary: PipSummary; cases: PipCase[] }> => {
    const rows = await fetchTab(SHEET_TABS.pipCases);
    const cases = rows.map(mapPipCaseRow);
    return { summary: computePipSummary(cases), cases };
  },
  ["pip"],
  { revalidate: REVALIDATE_SECONDS }
);

// "One Year Connects" — flight-risk / retention-connect tracker, added to
// dashboard scope per HRBP request (not in the original PRD).
export const getConnects = unstable_cache(
  async (): Promise<ConnectRecord[]> => {
    const rows = await fetchTab(SHEET_TABS.connects);
    return rows.map(mapConnectRow);
  },
  ["connects"],
  { revalidate: REVALIDATE_SECONDS }
);

// Probation tracker, added to dashboard scope per HRBP request.
export const getProbation = unstable_cache(
  async (): Promise<ProbationRecord[]> => {
    const rows = await fetchTab(SHEET_TABS.probation);
    return rows.map(mapProbationRow);
  },
  ["probation"],
  { revalidate: REVALIDATE_SECONDS }
);
