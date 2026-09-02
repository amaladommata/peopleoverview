export interface Employee {
  id: string; // MM ID / MMID
  name: string;
  doj: Date | null; // Date of Joining
  exitDate: Date | null; // LWD — null if still active
  client: string;
  team: string;
  serviceArea: string;
  band: string; // Grade/BAND
  billingType: string; // Billed / Floater / VAR / Training
  deliveryLead: string;
  deliveryHead: string; // span — always populate, even though v1 doesn't filter on it
  hrbp: string;
  gender: string;
  pgRating: string | null; // Latest QPR / PG Rating
  tenureYears: number | null; // from numeric Tenure column, never from Tenure Bracket
  voluntary: boolean | null; // true = voluntary exit, false = involuntary, null = still active
  reasonCategory: string | null; // from Attrition Tracker `Reasons Category`
}

export interface ResignationRecord {
  id: string;
  name: string;
  client: string;
  team: string;
  deliveryLead: string;
  band: string;
  tenureYears: number;
  reasonCategory: string;
  notes: string;
  // As of the live "Resignations - August" tab (added post-PRD): RAD + LWD
  // exist, but there is no explicit Status column. resignationDate = RAD.
  // status is derived — "Serving Notice" while expectedLwd is still in the
  // future, "Converted to Exit" once it's passed (the row should normally
  // have been moved to the Attrition tab by then, but this stays correct
  // defensively either way). "Withdrawn"/"Absconded" are never derived from
  // this tab — nothing in the data signals a withdrawal, since a withdrawn
  // row is presumably just deleted rather than status-flagged. That means
  // resignationsWithdrawn stays null (not fabricable from a single snapshot)
  // until the sheet tracks it explicitly.
  resignationDate: Date | null;
  status: "Serving Notice" | "Withdrawn" | "Converted to Exit" | "Absconded" | null;
  withdrawalDate: Date | null;
  expectedLwd: Date | null;
}

// "One Year Connects" tab — a flight-risk / retention-connect tracker
// (RED/AMBER/GREEN), added to the sheet after the PRD was written.
export interface ConnectRecord {
  id: string;
  name: string;
  band: string;
  doj: Date | null;
  team: string;
  businessHead: string;
  hrbp: string;
  connectStatus: string;
  connectDate: Date | null;
  ewsMarking: "RED" | "AMBER" | "GREEN" | null;
  comments: string;
}

// Probation tracker — added to the sheet after the PRD was written.
export interface ProbationRecord {
  id: string;
  name: string;
  band: string;
  client: string;
  team: string;
  deliveryLead: string;
  joiningDate: Date | null;
  probationEndDate: Date | null;
  status: string;
  comments: string;
}

export interface GrievanceRecord {
  employeeId: string;
  employeeName: string;
  client: string;
  category: string;
  description: string;
  severity: "High" | "Medium" | "Low";
  dateRaised: Date | null;
  status: "Open" | "In Progress" | "Closed";
  closureDate: Date | null;
}

export interface PipSummary {
  totalActive: number;
  newThisMonth: number;
  closedSuccess: number;
  closedExtended: number;
  closedExitInitiated: number;
  overdueReviews: number;
  successRate: number | null;
}

export interface PipCase {
  employeeName: string;
  band: string;
  team: string;
  startDate: Date | null;
  endDate: Date | null;
  nextReviewDate: Date | null;
  status: string;
  milestones: string[];
  outcomeNotes: string;
}

// The single computed unit every KPI tile, table row, and chart point derives from.
// Always produced by the same function (lib/attrition.ts) for a given (roster, scopeFilter, start, end).
export interface PeriodMetrics {
  scopeLabel: string; // e.g. "All", "Hulu", "Samsung India" — what this metrics object is scoped to
  start: Date;
  end: Date;
  openingHeadcount: number;
  closingHeadcount: number;
  hires: number;
  exits: number;
  voluntaryExits: number;
  involuntaryExits: number;
  netChange: number;
  attritionPct: number; // exits / avg(opening, closing) — PRD §5.2, the only formula in use
  resignationsReceived: number | null; // null until resignation dates exist
  resignationsWithdrawn: number | null; // null until resignation dates exist
  inNoticePipeline: number | null; // null until resignation status exists
  exitRows: Employee[];
  hireRows: Employee[];
}

export type PeriodPreset = "week" | "month" | "ytd" | "custom";

export interface ScopeFilter {
  client?: string;
  team?: string;
  band?: string;
  billingType?: string;
  deliveryLead?: string;
  deliveryHead?: string; // reserved for future multi-span filter, unused in v1 UI
  tenureBucket?: string;
}
