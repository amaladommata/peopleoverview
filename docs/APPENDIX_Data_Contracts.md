# Appendix — Data Contracts & Environment Setup
Companion to `PRD_HRBP_Leadership_Dashboard.md`. Read that first; this is the concrete implementation contract Claude Code should treat as authoritative for types and config.

---

## A. Core TypeScript interfaces

```typescript
// lib/types.ts

export interface Employee {
  id: string;                    // MM ID / MMID
  name: string;
  doj: Date | null;              // Date of Joining
  exitDate: Date | null;         // LWD — null if still active
  client: string;
  team: string;
  serviceArea: string;
  band: string;                  // Grade/BAND
  billingType: string;           // Billed / Floater / VAR / Training
  deliveryLead: string;
  deliveryHead: string;          // span — always populate, even though v1 doesn't filter on it
  hrbp: string;
  gender: string;
  pgRating: string | null;       // Latest QPR / PG Rating
  tenureYears: number | null;    // from numeric Tenure column, never from Tenure Bracket
  voluntary: boolean | null;     // true = voluntary exit, false = involuntary, null = still active
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
  // Below fields are NULL until the 3 new sheet columns exist (PRD §4, §10.1)
  resignationDate: Date | null;
  status: "Serving Notice" | "Withdrawn" | "Converted to Exit" | "Absconded" | null;
  withdrawalDate: Date | null;
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
  scopeLabel: string;             // e.g. "All", "Hulu", "Samsung India" — what this metrics object is scoped to
  start: Date;
  end: Date;
  openingHeadcount: number;
  closingHeadcount: number;
  hires: number;
  exits: number;
  voluntaryExits: number;
  involuntaryExits: number;
  netChange: number;
  attritionPct: number;           // exits / avg(opening, closing) — PRD §5.2, the only formula in use
  resignationsReceived: number | null;   // null until resignation dates exist
  resignationsWithdrawn: number | null;  // null until resignation dates exist
  inNoticePipeline: number | null;       // null until resignation status exists
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
  deliveryHead?: string;          // reserved for future multi-span filter, unused in v1 UI
  tenureBucket?: string;
}
```

## B. Core calculation function signature (PRD §5.1–5.2)

```typescript
// lib/attrition.ts

/**
 * The single source of truth for every number in the app. Every KPI tile,
 * every data-cut table row, every chart point calls this — never a
 * separately-hand-rolled aggregate. This is what makes the numbers
 * consistent across the whole dashboard by construction, not by convention.
 */
export function computePeriodMetrics(
  roster: Employee[],
  resignations: ResignationRecord[],
  scope: ScopeFilter,
  start: Date,
  end: Date
): PeriodMetrics {
  // 1. Filter roster to scope (client/team/band/etc. — every non-empty
  //    field in `scope` must match)
  // 2. openingHeadcount = count where isEmployedOn(day before start)
  // 3. closingHeadcount = count where isEmployedOn(end)
  // 4. exits = scoped roster where exitDate in [start, end]
  // 5. attritionPct = exits.length / avg(openingHeadcount, closingHeadcount) * 100
  // 6. resignation fields = null unless resignations[].resignationDate exists
  // ...
}

function isEmployedOn(e: Employee, t: Date): boolean {
  if (!e.doj) return false;
  if (e.doj > t) return false;
  if (e.exitDate && e.exitDate <= t) return false;
  return true;
}
```

## C. Environment variables (Vercel project settings)

| Variable | Purpose | Notes |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Sheets API v4 auth | Base64-encoded JSON key, decoded server-side only |
| `GOOGLE_SHEET_ID` | Which spreadsheet to read | The ID from the Sheet's URL |
| `RESEND_API_KEY` | Email send (if Resend chosen, PRD §10.5) | Or omit if sending stays in Apps Script |
| `RESEND_FROM_ADDRESS` | Verified sending address | Only if using Resend |
| `FY_START_MONTH` | YTD calculation anchor | `4` per PRD §5.4 — confirm before hardcoding |
| `DASHBOARD_ACCESS_PASSWORD` | Vercel deployment protection | Or use Vercel's built-in password-protect feature instead of app-level |

## D. Sheet tab → API route mapping

| Sheet tab | Route | Cache |
|---|---|---|
| `Headcount Overview` | `GET /api/roster` (active employees) | 60s revalidate |
| `Attrition Tracker` | merged into `/api/roster` (exited employees, unioned per PRD §5.1) | 60s revalidate |
| `📉 Resignation Tracker` | `GET /api/resignations` | 60s revalidate |
| `Grievance Tracker` | `GET /api/grievances` | 60s revalidate |
| `📈 PIP Register` | `GET /api/pip` (summary block + case log) | 60s revalidate |

All routes are server-only (`route.ts` handlers), call Sheets API with the service account, and never expose the raw sheet response — always map to the typed interfaces in §A before returning JSON to the client.

## E. Column name reference (exact strings, for the Sheets API column mapping)

**Headcount Overview:** `MM ID`, `Full name`, `Gender`, `Grade`, `Employee type`, `Date Of Joining/Permanent`, `Service Area`, `Job Location`, `TEAM`, `CLIENT_NAME`, `Billing type`, `Delivery Lead`, `Tenure`, `Tenure Bracket` (do not use directly, see PRD §4.1), `Delivery Head`, `HRBP`, `BAND`, `Latest QPR Rating`, `Latest PG`

**Attrition Tracker:** `MMID`, `Name`, `Status`, `DOJ`, `Grade`, `Gender`, `Exit Type`, `LWD`, `DOE Year`, `DOE Month`, `Team`, `Client`, `Delivery Head`, `Tenure`, `Tenurity`, `Role/Function`, `Voluntary/Involutnary` (note: sic — matches source spelling exactly), `Detailed Reason`, `Reasons Category`, `Quarter`, `PG Rating`, `Next Company`, `Package offered`, `Current Package`, `Hike%`

**📉 Resignation Tracker:** `Sr No`, `Employee ID`, `Employee Name`, `Band/Level`, `Client`, `Team`, `Delivery Lead`, `Exit Type`, `Tenure (Years)`, `Primary Exit Reason`, `Notes` — plus 3 columns to be added: `Resignation Date`, `Status`, `Withdrawal Date`

**Grievance Tracker:** `Employee ID`, `Employee Name`, `Client`, `Grievance Category`, `Description`, `Severity`, `Date Raised`, `Status`, `Closure Date`
