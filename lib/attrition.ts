import { Employee, PeriodMetrics, ResignationRecord, ScopeFilter } from "./types";

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

export function isEmployedOn(e: Employee, t: Date): boolean {
  if (!e.doj) return false;
  if (e.doj > t) return false;
  if (e.exitDate && e.exitDate <= t) return false;
  return true;
}

// Recomputed tenure bracket from the numeric Tenure column (PRD §4.1) —
// never read the source sheet's `Tenure Bracket` column, it stores some
// values as corrupted Excel dates.
export function tenureBucket(tenureYears: number | null): string {
  if (tenureYears === null) return "Unknown";
  if (tenureYears < 1) return "<1yr";
  if (tenureYears < 2) return "1-2yr";
  if (tenureYears < 3) return "2-3yr";
  if (tenureYears < 5) return "3-5yr";
  return "5yr+";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Pure ms arithmetic rather than setDate() — keeps this correct regardless
// of the server's local timezone, since dates here are date-only instants
// (typically UTC midnight from serialToDate).
function dayBefore(d: Date): Date {
  return new Date(d.getTime() - MS_PER_DAY);
}

function scopeLabel(scope: ScopeFilter): string {
  const parts = Object.entries(scope)
    .filter(([, v]) => v)
    .map(([, v]) => v);
  return parts.length ? parts.join(" / ") : "All";
}

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
  const scoped = roster.filter((e) => matchesScope(e, scope));

  const openingHeadcount = scoped.filter((e) => isEmployedOn(e, dayBefore(start))).length;
  const closingHeadcount = scoped.filter((e) => isEmployedOn(e, end)).length;

  const exitRows = scoped.filter(
    (e) => e.exitDate && e.exitDate >= start && e.exitDate <= end
  );
  const hireRows = scoped.filter((e) => e.doj && e.doj >= start && e.doj <= end);

  const exits = exitRows.length;
  const voluntaryExits = exitRows.filter((e) => e.voluntary === true).length;
  const involuntaryExits = exitRows.filter((e) => e.voluntary === false).length;
  const hires = hireRows.length;

  const avgHeadcount = (openingHeadcount + closingHeadcount) / 2;
  const attritionPct = avgHeadcount > 0 ? (exits / avgHeadcount) * 100 : 0;

  const scopedResignations = resignations.filter((r) => {
    if (scope.client && r.client !== scope.client) return false;
    if (scope.team && r.team !== scope.team) return false;
    if (scope.band && r.band !== scope.band) return false;
    if (scope.deliveryLead && r.deliveryLead !== scope.deliveryLead) return false;
    return true;
  });

  const hasResignationDates = scopedResignations.some((r) => r.resignationDate !== null);
  // Separate from hasResignationDates: the live "Resignations - August" tab
  // has RAD/LWD but no withdrawal signal at all (see mapResignationRow), so
  // withdrawalDate is currently always null. Reporting 0 here would claim
  // "confirmed zero withdrawals" when really "not trackable yet" — stay
  // null until some row actually carries a withdrawalDate.
  const hasWithdrawalDates = scopedResignations.some((r) => r.withdrawalDate !== null);

  const resignationsReceived = hasResignationDates
    ? scopedResignations.filter(
        (r) => r.resignationDate && r.resignationDate >= start && r.resignationDate <= end
      ).length
    : null;

  const resignationsWithdrawn = hasWithdrawalDates
    ? scopedResignations.filter(
        (r) => r.withdrawalDate && r.withdrawalDate >= start && r.withdrawalDate <= end
      ).length
    : null;

  const inNoticePipeline = hasResignationDates
    ? scopedResignations.filter((r) => r.status === "Serving Notice").length
    : null;

  return {
    scopeLabel: scopeLabel(scope),
    start,
    end,
    openingHeadcount,
    closingHeadcount,
    hires,
    exits,
    voluntaryExits,
    involuntaryExits,
    netChange: closingHeadcount - openingHeadcount,
    attritionPct,
    resignationsReceived,
    resignationsWithdrawn,
    inNoticePipeline,
    exitRows,
    hireRows,
  };
}
