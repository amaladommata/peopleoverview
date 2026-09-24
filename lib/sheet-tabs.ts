// Exact tab layout of the live "Global Media & Creative - People Dashboard"
// sheet (spreadsheetId in GOOGLE_SHEET_ID), verified 2026-09-24. This sheet
// was restructured after the PRD/Appendix were written — tab names and a
// couple of schemas differ from what's documented there. Row numbers are
// 1-indexed A1-notation. Update here, not per-caller, if HRBP restructures
// a tab again.
export const SHEET_TABS = {
  // Was "Employee Data - 29" — that numeric suffix turned out NOT to be
  // stable (it broke production within weeks, "Unable to parse range").
  // Renamed to the plain "Employee Data" on 2026-09-24 specifically to
  // stop this from recurring. If this tab ever gets renamed again, this
  // is the single line to fix.
  headcount: {
    name: "Employee Data",
    headerRow: 1,
    dataStartRow: 2,
    lastCol: "AB",
  },
  // Confirmed exits — LWD already occurred. Schema unchanged from the
  // original PRD/Appendix, just moved to a plainly-named "Attrition" tab.
  attrition: {
    name: "Attrition",
    headerRow: 1,
    dataStartRow: 2,
    lastCol: "Y",
  },
  // In-notice pipeline — confirmed to stay one continuous tab, not
  // recreated monthly, despite the "- August" in its current name.
  // RAD (resignation date) + LWD (expected last working day) columns now
  // exist; there is no explicit Status column (see ResignationRecord).
  resignation: {
    name: "Resignations - August",
    headerRow: 1,
    dataStartRow: 2,
    lastCol: "L",
  },
  // Not yet created in the source sheet (PRD's Grievance Tracker tab).
  // getGrievances() handles a missing tab gracefully and returns [].
  grievance: {
    name: "Grievance Tracker",
    headerRow: 2,
    dataStartRow: 3,
    lastCol: "I",
  },
  // Case log only — no auto-calc summary block exists on this tab (unlike
  // the original PRD's PIP Register). The summary shown in the app is
  // derived in code from these case rows instead (lib/data-source.ts).
  pipCases: {
    name: "PIP",
    headerRow: 1,
    dataStartRow: 2,
    lastCol: "K",
  },
  // Flight-risk / retention-connect tracker (RED/AMBER/GREEN), not in the
  // original PRD — added to the dashboard scope per HRBP request.
  connects: {
    name: "One Year Connects - August",
    headerRow: 1,
    dataStartRow: 2,
    lastCol: "N",
  },
  // Probation tracker, not in the original PRD — added to the dashboard
  // scope per HRBP request.
  probation: {
    name: "Probation",
    headerRow: 1,
    dataStartRow: 2,
    lastCol: "J",
  },
} as const;

export function headerRange(tab: (typeof SHEET_TABS)[keyof typeof SHEET_TABS]): string {
  return `'${tab.name}'!A${tab.headerRow}:${tab.lastCol}${tab.headerRow}`;
}

export function dataRange(tab: (typeof SHEET_TABS)[keyof typeof SHEET_TABS], lastRow = 1000): string {
  return `'${tab.name}'!A${tab.dataStartRow}:${tab.lastCol}${lastRow}`;
}
