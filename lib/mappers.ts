import {
  ConnectRecord,
  Employee,
  GrievanceRecord,
  PipCase,
  PipSummary,
  ProbationRecord,
  ResignationRecord,
} from "./types";
import { serialToDate } from "./serial-date";

export type SheetRow = Record<string, unknown>;

// Zips a header row with each data row into a name-keyed record, so mapping
// is resilient to column reordering in the source sheet — only the header
// text (Appendix §E) has to match, not column position.
export function rowsToRecords(header: unknown[], rows: unknown[][]): SheetRow[] {
  return rows
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ""))
    .map((row) => {
      const record: SheetRow = {};
      header.forEach((h, i) => {
        if (typeof h === "string" && h) record[h] = row[i];
      });
      return record;
    });
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

function parseVoluntary(v: unknown): boolean | null {
  const s = str(v).toLowerCase();
  if (s.startsWith("volunt")) return true;
  if (s.startsWith("involunt")) return false;
  return null;
}

// Headcount Overview → active-roster Employee rows (no exitDate: PRD §5.1
// treats this tab as "currently active", exits live only in Attrition Tracker).
export function mapHeadcountRow(r: SheetRow): Employee {
  return {
    id: str(r["MM ID"]),
    name: str(r["Full name"]),
    doj: serialToDate(r["Date Of Joining/Permanent"]),
    exitDate: null,
    client: str(r["CLIENT_NAME"]),
    team: str(r["TEAM"]),
    serviceArea: str(r["Service Area"]),
    band: str(r["BAND"]) || str(r["Grade"]),
    billingType: str(r["Billing type"]),
    deliveryLead: str(r["Delivery Lead"]),
    deliveryHead: str(r["Delivery Head"]),
    hrbp: str(r["HRBP"]),
    gender: str(r["Gender"]),
    pgRating: str(r["Latest QPR Rating"]) || null,
    tenureYears: num(r["Tenure"]),
    voluntary: null,
    reasonCategory: null,
  };
}

// Attrition Tracker → exited Employee rows, unioned into the roster (PRD §5.1)
// so past-date headcount reconstruction includes people who have since left.
export function mapAttritionRow(r: SheetRow): Employee {
  return {
    id: str(r["MMID"]),
    name: str(r["Name"]),
    doj: serialToDate(r["DOJ"]),
    exitDate: serialToDate(r["LWD"]),
    client: str(r["Client"]),
    team: str(r["Team"]),
    serviceArea: "",
    band: str(r["Grade"]),
    billingType: "",
    deliveryLead: "",
    deliveryHead: str(r["Delivery Head"]),
    hrbp: "",
    gender: str(r["Gender"]),
    pgRating: str(r["PG Rating"]) || null,
    tenureYears: num(r["Tenure"]),
    voluntary: parseVoluntary(r["Voluntary/Involutnary"]),
    reasonCategory: str(r["Reasons Category"]) || null,
  };
}

// Merges Headcount Overview (active) + Attrition Tracker (exited) into one
// roster. Union, not append: if the same MM ID appears in both (e.g. exited
// mid-sync), the Attrition Tracker row wins since it carries the exit date.
export function buildRoster(headcountRows: SheetRow[], attritionRows: SheetRow[]): Employee[] {
  const active = headcountRows.map(mapHeadcountRow);
  const exited = attritionRows.map(mapAttritionRow);
  const exitedIds = new Set(exited.map((e) => e.id).filter(Boolean));
  const activeDeduped = active.filter((e) => !exitedIds.has(e.id));
  return [...activeDeduped, ...exited];
}

// "Resignations - August" tab (the in-notice pipeline) — RAD (resignation
// date) and LWD (expected last working day) exist as of the live sheet,
// but there is no explicit Status column. Status is derived from `now` vs
// expectedLwd; see the comment on ResignationRecord in lib/types.ts for why
// "Withdrawn"/"Absconded" can never come out of this derivation.
export function mapResignationRow(r: SheetRow, now: Date = new Date()): ResignationRecord {
  const expectedLwd = serialToDate(r["LWD"]);
  const status: ResignationRecord["status"] = expectedLwd
    ? expectedLwd > now
      ? "Serving Notice"
      : "Converted to Exit"
    : null;
  return {
    id: str(r["Employee ID"]),
    name: str(r["Employee Name"]),
    client: str(r["Client"]),
    team: str(r["Team"]),
    deliveryLead: str(r["Delivery Lead"]),
    band: str(r["Band/Level"]),
    tenureYears: num(r["Tenure (Years)"]) ?? 0,
    reasonCategory: str(r["Primary Exit Reason"]),
    notes: str(r["Notes"]),
    resignationDate: serialToDate(r["RAD"]),
    status,
    withdrawalDate: null,
    expectedLwd,
  };
}

export function mapGrievanceRow(r: SheetRow): GrievanceRecord {
  const severity = str(r["Severity"]);
  const status = str(r["Status"]);
  return {
    employeeId: str(r["Employee ID"]),
    employeeName: str(r["Employee Name"]),
    client: str(r["Client"]),
    category: str(r["Grievance Category"]),
    description: str(r["Description"]),
    severity: (["High", "Medium", "Low"].includes(severity) ? severity : "Low") as GrievanceRecord["severity"],
    dateRaised: serialToDate(r["Date Raised"]),
    status: (["Open", "In Progress", "Closed"].includes(status) ? status : "Open") as GrievanceRecord["status"],
    closureDate: serialToDate(r["Closure Date"]),
  };
}

// The live "PIP" tab is a case log only — no auto-calc summary block like
// the original PRD's PIP Register. The summary is derived from case rows
// instead (mirrors the sheet's old formulas, computed in code so it works
// regardless of whether a summary block ever exists on the tab).
export function computePipSummary(cases: PipCase[], now: Date = new Date()): PipSummary {
  const closed = cases.filter((c) => c.status.toLowerCase() !== "active");
  const closedSuccess = closed.filter((c) => /success/i.test(c.status)).length;
  const closedExtended = closed.filter((c) => /extend/i.test(c.status)).length;
  const closedExitInitiated = closed.filter((c) => /exit/i.test(c.status)).length;
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const newThisMonth = cases.filter((c) => c.startDate && c.startDate >= startOfMonth).length;
  const overdueReviews = cases.filter((c) => c.nextReviewDate && c.nextReviewDate < now).length;
  const closedCount = closed.length;
  return {
    totalActive: cases.filter((c) => c.status.toLowerCase() === "active").length,
    newThisMonth,
    closedSuccess,
    closedExtended,
    closedExitInitiated,
    overdueReviews,
    successRate: closedCount > 0 ? (closedSuccess / closedCount) * 100 : null,
  };
}

export function mapPipCaseRow(r: SheetRow): PipCase {
  const milestoneKeys = Object.keys(r).filter((k) => k.startsWith("Milestone"));
  return {
    employeeName: str(r["Employee Name"]),
    band: str(r["Band"]),
    team: str(r["Project / Team"]),
    startDate: serialToDate(r["PIP Start Date"]),
    endDate: serialToDate(r["PIP End Date"]),
    // No "Next Review Date" column on the live tab — stays null.
    nextReviewDate: serialToDate(r["Next Review Date"]),
    status: str(r["Status"]),
    milestones: milestoneKeys.map((k) => str(r[k])).filter(Boolean),
    outcomeNotes: str(r["Outcome / HRBP Notes"]),
  };
}

// "One Year Connects" tab — flight-risk / retention-connect tracker.
export function mapConnectRow(r: SheetRow): ConnectRecord {
  const marking = str(r["HRBP EWS Marking"]).toUpperCase();
  return {
    id: str(r["MMID"]),
    name: str(r["Full name"]),
    band: str(r["Grade"]),
    doj: serialToDate(r["DOJ"]),
    team: str(r["Team"]),
    businessHead: str(r["Business Head"]),
    hrbp: str(r["HRBP"]),
    connectStatus: str(r["Connect Status"]),
    connectDate: serialToDate(r["Connect Date"]),
    ewsMarking: (["RED", "AMBER", "GREEN"].includes(marking) ? marking : null) as ConnectRecord["ewsMarking"],
    comments: str(r["HRBP Comments"]),
  };
}

// Probation tracker tab.
export function mapProbationRow(r: SheetRow): ProbationRecord {
  return {
    id: str(r["Employee ID"]),
    name: str(r["Employee Name"]),
    band: str(r["Band/Level"]),
    client: str(r["Client"]),
    team: str(r["Team"]),
    deliveryLead: str(r["Delivery Lead"]),
    joiningDate: serialToDate(r["Joining Date"]),
    probationEndDate: serialToDate(r["Probation End Date"] ?? r["Probation \nEnd Date"]),
    status: str(r["Status"]),
    comments: str(r["Comments"]),
  };
}
