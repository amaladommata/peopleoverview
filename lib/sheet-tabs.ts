// Exact tab layout of the source workbook (Alekhya_August_HRBP_Tracker),
// verified against a real export. Row numbers are 1-indexed A1-notation,
// matching PRD §4.1 / Appendix §D-E. Update here, not per-caller, if HRBP
// restructures a tab.
export const SHEET_TABS = {
  headcount: {
    name: "Headcount Overview",
    headerRow: 1,
    dataStartRow: 2,
    lastCol: "AB",
  },
  attrition: {
    name: "Attrition Tracker",
    headerRow: 1,
    dataStartRow: 2,
    lastCol: "Y",
  },
  resignation: {
    // Mislabeled internally as "ATTRITION TRACKER" (PRD §4) — functions as
    // the resignation log. Title/description occupy rows 1-2, a monthly
    // summary block rows 4-6, the actual exit log starts at row 9.
    name: "📉 Resignation Tracker",
    headerRow: 9,
    dataStartRow: 10,
    lastCol: "K",
  },
  grievance: {
    name: "Grievance Tracker",
    headerRow: 2,
    dataStartRow: 3,
    lastCol: "I",
  },
  pipSummary: {
    name: "📈 PIP Register",
    headerRow: 5,
    dataStartRow: 6,
    lastCol: "G",
  },
  pipCases: {
    name: "📈 PIP Register",
    headerRow: 10,
    dataStartRow: 11,
    lastCol: "L",
  },
} as const;

export function headerRange(tab: (typeof SHEET_TABS)[keyof typeof SHEET_TABS]): string {
  return `'${tab.name}'!A${tab.headerRow}:${tab.lastCol}${tab.headerRow}`;
}

export function dataRange(tab: (typeof SHEET_TABS)[keyof typeof SHEET_TABS], lastRow = 1000): string {
  return `'${tab.name}'!A${tab.dataStartRow}:${tab.lastCol}${lastRow}`;
}
