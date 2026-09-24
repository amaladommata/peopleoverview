import { computePeriodMetrics, tenureBucket } from "./attrition";
import { DateRange } from "./period";
import { Employee, ResignationRecord, ScopeFilter } from "./types";

export type CutField = "client" | "team" | "band" | "billingType" | "tenureBucket" | "pgRating";

function cutValue(e: Employee, field: CutField): string {
  switch (field) {
    case "client":
      return e.client || "Unknown";
    case "team":
      return e.team || "Unknown";
    case "band":
      return e.band || "Unknown";
    case "billingType":
      return e.billingType || "Unknown";
    case "tenureBucket":
      return tenureBucket(e.tenureYears);
    case "pgRating":
      return e.pgRating || "Unknown";
  }
}

function scopeKeyFor(field: CutField): keyof ScopeFilter | null {
  switch (field) {
    case "client":
      return "client";
    case "team":
      return "team";
    case "band":
      return "band";
    case "billingType":
      return "billingType";
    case "tenureBucket":
      return "tenureBucket";
    case "pgRating":
      return null; // not a ScopeFilter field — filtered ad hoc below
  }
}

export interface CutRow {
  label: string;
  closingHeadcount: number;
  exits: number;
  attritionPctMtd: number;
  attritionPctPeriod: number;
  attritionPctYtd: number;
}

// One row per distinct value of `field` present in the (already scope- and
// filter-narrowed) roster, each independently recomputed through
// computePeriodMetrics for MTD / the selected period / YTD — the same
// scoped opening+closing HC reconstruction as every other number in the
// app (PRD §5.2, §7.6). Sorted by YTD attrition % descending.
export function computeDataCut(
  roster: Employee[],
  resignations: ResignationRecord[],
  baseScope: ScopeFilter,
  field: CutField,
  mtd: DateRange,
  period: DateRange,
  ytd: DateRange
): CutRow[] {
  const baseFiltered = roster.filter((e) => matchesScope(e, baseScope));
  const values = Array.from(new Set(baseFiltered.map((e) => cutValue(e, field)))).filter(
    (v) => v !== "Unknown"
  );

  const scopeKey = scopeKeyFor(field);

  return values
    .map((label) => {
      const scope: ScopeFilter = scopeKey ? { ...baseScope, [scopeKey]: label } : baseScope;
      const rosterForRow =
        field === "pgRating" ? baseFiltered.filter((e) => cutValue(e, field) === label) : roster;

      const mMtd = computePeriodMetrics(rosterForRow, resignations, scope, mtd.start, mtd.end);
      const mPeriod = computePeriodMetrics(rosterForRow, resignations, scope, period.start, period.end);
      const mYtd = computePeriodMetrics(rosterForRow, resignations, scope, ytd.start, ytd.end);

      return {
        label,
        closingHeadcount: mPeriod.closingHeadcount,
        exits: mPeriod.exits,
        attritionPctMtd: mMtd.attritionPct,
        attritionPctPeriod: mPeriod.attritionPct,
        attritionPctYtd: mYtd.attritionPct,
      };
    })
    .sort((a, b) => b.attritionPctYtd - a.attritionPctYtd);
}

function matchesScope(e: Employee, scope: ScopeFilter): boolean {
  if (scope.client && e.client !== scope.client) return false;
  if (scope.team && e.team !== scope.team) return false;
  if (scope.band && e.band !== scope.band) return false;
  if (scope.billingType && e.billingType !== scope.billingType) return false;
  if (scope.deliveryLead && e.deliveryLead !== scope.deliveryLead) return false;
  if (scope.deliveryHead && e.deliveryHead !== scope.deliveryHead) return false;
  if (scope.tenureBucket && tenureBucket(e.tenureYears) !== scope.tenureBucket) return false;
  return true;
}

export interface RankedRow {
  label: string;
  attritionPct: number;
}

// Delivery Lead ranking (PRD §7.6a) — attrition % for the selected period,
// scoped per Delivery Lead on top of whatever Client/Delivery Lead filter is
// already active, sorted descending. Same reactivity as everything else:
// pick Weekly and every row here becomes that week's number.
export function deliveryLeadRanking(
  roster: Employee[],
  resignations: ResignationRecord[],
  baseScope: ScopeFilter,
  period: DateRange
): RankedRow[] {
  const baseFiltered = roster.filter((e) => matchesScope(e, baseScope));
  const leads = Array.from(new Set(baseFiltered.map((e) => e.deliveryLead).filter(Boolean)));

  return leads
    .map((label) => {
      const scope: ScopeFilter = { ...baseScope, deliveryLead: label };
      const m = computePeriodMetrics(roster, resignations, scope, period.start, period.end);
      return { label, attritionPct: m.attritionPct };
    })
    .filter((r) => r.attritionPct > 0)
    .sort((a, b) => b.attritionPct - a.attritionPct);
}

export interface TenureBandRow {
  bucket: string;
  pctOfExits: number;
  count: number;
}

// % of this period's exits by tenure bucket (PRD §7.6a) — <1yr framed as
// early/onboarding attrition, 2yr+ as tenured/growth-ceiling attrition.
export function tenureBandExitDistribution(exitRows: Employee[]): TenureBandRow[] {
  if (exitRows.length === 0) return [];
  const counts = new Map<string, number>();
  for (const e of exitRows) {
    const bucket = tenureBucket(e.tenureYears);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const order = ["<1yr", "1-2yr", "2-3yr", "3-5yr", "5yr+", "Unknown"];
  return order
    .filter((b) => counts.has(b))
    .map((bucket) => {
      const count = counts.get(bucket)!;
      return { bucket, count, pctOfExits: (count / exitRows.length) * 100 };
    });
}

export interface PgRatingSplit {
  topBandPct: number;
  midBandPct: number;
  bottomBandPct: number;
  knownCount: number;
}

const TOP_BAND = new Set(["PG1", "PG2"]);
const BOTTOM_BAND = new Set(["PG4", "PG5"]);

// % of this period's exits by PG Rating band — answers "are we losing our
// best people, or managing out our weakest" (PRD §7.6a). PG1/PG2 = top
// performers, PG4/PG5 = weakest; PG3 and unrated exits are excluded from
// the percentage base since they answer neither question.
export function pgRatingVsExit(exitRows: Employee[]): PgRatingSplit {
  const rated = exitRows.filter((e) => e.pgRating && e.pgRating !== "Unknown");
  const top = rated.filter((e) => TOP_BAND.has(e.pgRating!)).length;
  const bottom = rated.filter((e) => BOTTOM_BAND.has(e.pgRating!)).length;
  const mid = rated.length - top - bottom;
  const knownCount = rated.length;
  return {
    topBandPct: knownCount > 0 ? (top / knownCount) * 100 : 0,
    midBandPct: knownCount > 0 ? (mid / knownCount) * 100 : 0,
    bottomBandPct: knownCount > 0 ? (bottom / knownCount) * 100 : 0,
    knownCount,
  };
}
