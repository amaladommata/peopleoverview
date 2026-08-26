import "server-only";
import { unstable_cache } from "next/cache";
import { fetchRange } from "./sheets-client";
import { dataRange, headerRange, SHEET_TABS } from "./sheet-tabs";
import {
  buildRoster,
  mapGrievanceRow,
  mapPipCaseRow,
  mapPipSummaryRow,
  mapResignationRow,
  rowsToRecords,
} from "./mappers";
import { Employee, GrievanceRecord, PipCase, PipSummary, ResignationRecord } from "./types";

// 60s revalidate window (Appendix §D) — keeps Sheets API calls bounded
// under repeated dashboard refreshes without baking data into the build.
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
    return rows.map(mapResignationRow);
  },
  ["resignations"],
  { revalidate: REVALIDATE_SECONDS }
);

export const getGrievances = unstable_cache(
  async (): Promise<GrievanceRecord[]> => {
    const rows = await fetchTab(SHEET_TABS.grievance);
    return rows.map(mapGrievanceRow);
  },
  ["grievances"],
  { revalidate: REVALIDATE_SECONDS }
);

export const getPip = unstable_cache(
  async (): Promise<{ summary: PipSummary; cases: PipCase[] }> => {
    const [summaryHeader, summaryRow, caseRows] = await Promise.all([
      fetchRange(headerRange(SHEET_TABS.pipSummary)),
      fetchRange(dataRange(SHEET_TABS.pipSummary, SHEET_TABS.pipSummary.dataStartRow)),
      fetchTab(SHEET_TABS.pipCases),
    ]);
    const summaryRecords = rowsToRecords(summaryHeader[0] ?? [], summaryRow);
    const summary = summaryRecords[0]
      ? mapPipSummaryRow(summaryRecords[0])
      : {
          totalActive: 0,
          newThisMonth: 0,
          closedSuccess: 0,
          closedExtended: 0,
          closedExitInitiated: 0,
          overdueReviews: 0,
          successRate: null,
        };
    return { summary, cases: caseRows.map(mapPipCaseRow) };
  },
  ["pip"],
  { revalidate: REVALIDATE_SECONDS }
);
