"use client";

import { useMemo, useState } from "react";
import { computePeriodMetrics, tenureBucket } from "@/lib/attrition";
import {
  computeDataCut,
  deliveryLeadRanking,
  pgRatingVsExit,
  tenureBandExitDistribution,
} from "@/lib/cuts";
import { DateRange, mtdRange, resolvePeriod, trailingMonths, ytdFixedRange } from "@/lib/period";
import { generateTakeaways } from "@/lib/takeaways";
import {
  ConnectRecord,
  Employee,
  GrievanceRecord,
  PeriodPreset,
  PipCase,
  PipSummary,
  ResignationRecord,
  ScopeFilter,
} from "@/lib/types";
import { TARGET_ATTRITION_PCT } from "@/config/constants";
import { PEOPLE_UPDATES } from "@/config/people-updates";
import TrendChart, { TrendPoint } from "./TrendChart";
import ExitReasonsChart, { ExitReasonMonth } from "./ExitReasonsChart";

interface DashboardProps {
  roster: Employee[];
  resignations: ResignationRecord[];
  grievances: GrievanceRecord[];
  pipSummary: PipSummary;
  pipCases: PipCase[];
  connects: ConnectRecord[];
  lastRefreshed: string;
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function pctPillClass(pct: number, target: number): string {
  if (pct > target) return "bg-risk-redSoft text-risk-red";
  if (pct > target * 0.5) return "bg-risk-amberSoft text-risk-amber";
  return "bg-teal-soft text-teal-ink";
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function Dashboard({
  roster,
  resignations,
  grievances,
  pipSummary,
  pipCases,
  connects,
  lastRefreshed,
}: DashboardProps) {
  const now = useMemo(() => new Date(), []);

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customStart, setCustomStart] = useState(toDateInputValue(mtdRange(now).start));
  const [customEnd, setCustomEnd] = useState(toDateInputValue(now));
  const [clientFilter, setClientFilter] = useState<string>("");
  const [deliveryLeadFilter, setDeliveryLeadFilter] = useState<string>("");

  const scope: ScopeFilter = useMemo(
    () => ({
      client: clientFilter || undefined,
      deliveryLead: deliveryLeadFilter || undefined,
    }),
    [clientFilter, deliveryLeadFilter]
  );

  const period: DateRange = useMemo(() => {
    if (preset === "custom") {
      return { start: new Date(customStart), end: new Date(customEnd) };
    }
    return resolvePeriod(preset, undefined, now);
  }, [preset, customStart, customEnd, now]);

  const mtd = useMemo(() => mtdRange(now), [now]);
  const ytd = useMemo(() => ytdFixedRange(now), [now]);

  const metrics = useMemo(
    () => computePeriodMetrics(roster, resignations, scope, period.start, period.end),
    [roster, resignations, scope, period]
  );

  const clientOptions = useMemo(
    () => Array.from(new Set(roster.map((e) => e.client).filter(Boolean))).sort(),
    [roster]
  );
  const deliveryLeadOptions = useMemo(
    () => Array.from(new Set(roster.map((e) => e.deliveryLead).filter(Boolean))).sort(),
    [roster]
  );

  // ---- Trailing 12 months: trend chart, exit-reasons chart, summary table ----
  const months = useMemo(() => trailingMonths(12, now), [now]);
  const monthlyMetrics = useMemo(
    () =>
      months.map((m) => {
        const metricsForMonth = computePeriodMetrics(roster, resignations, scope, m.start, m.end);
        const ytdToMonth = ytdFixedRange(m.end);
        const metricsYtdToMonth = computePeriodMetrics(roster, resignations, scope, ytdToMonth.start, ytdToMonth.end);
        return { month: m, metrics: metricsForMonth, ytdToMonth: metricsYtdToMonth };
      }),
    [months, roster, resignations, scope]
  );

  const trendPoints: TrendPoint[] = useMemo(
    () =>
      monthlyMetrics.map(({ month, metrics: m }) => ({
        label: month.label.slice(0, 3),
        exits: m.exits,
        resignationsReceived: m.resignationsReceived,
        attritionPct: m.attritionPct,
      })),
    [monthlyMetrics]
  );

  const reasonCategories = useMemo(() => {
    const set = new Set<string>();
    for (const { metrics: m } of monthlyMetrics.slice(-6)) {
      for (const e of m.exitRows) set.add(e.reasonCategory ?? "Unspecified");
    }
    return Array.from(set);
  }, [monthlyMetrics]);

  const exitReasonPoints: ExitReasonMonth[] = useMemo(
    () =>
      monthlyMetrics.slice(-6).map(({ month, metrics: m }) => {
        const row: ExitReasonMonth = { label: month.label.slice(0, 3), total: m.exits };
        for (const e of m.exitRows) {
          const cat = e.reasonCategory ?? "Unspecified";
          row[cat] = (typeof row[cat] === "number" ? (row[cat] as number) : 0) + 1;
        }
        return row;
      }),
    [monthlyMetrics]
  );

  // ---- Data cuts ----
  const byClient = useMemo(
    () => computeDataCut(roster, resignations, scope, "client", mtd, period, ytd),
    [roster, resignations, scope, mtd, period, ytd]
  );
  const byBand = useMemo(
    () => computeDataCut(roster, resignations, scope, "band", mtd, period, ytd),
    [roster, resignations, scope, mtd, period, ytd]
  );
  const byPgRating = useMemo(
    () => computeDataCut(roster, resignations, scope, "pgRating", mtd, period, ytd),
    [roster, resignations, scope, mtd, period, ytd]
  );

  // ---- Cross-tabs ----
  const leadRanking = useMemo(
    () => deliveryLeadRanking(roster, resignations, scope, period),
    [roster, resignations, scope, period]
  );
  const tenureDist = useMemo(() => tenureBandExitDistribution(metrics.exitRows), [metrics.exitRows]);
  const pgSplit = useMemo(() => pgRatingVsExit(metrics.exitRows), [metrics.exitRows]);

  const takeaways = useMemo(() => generateTakeaways(metrics, TARGET_ATTRITION_PCT), [metrics]);

  // ---- Resignation / in-notice pipeline, scoped by client/delivery lead only (not period — it's current state) ----
  const scopedResignations = useMemo(
    () =>
      resignations.filter((r) => {
        if (scope.client && r.client !== scope.client) return false;
        if (scope.deliveryLead && r.deliveryLead !== scope.deliveryLead) return false;
        return true;
      }),
    [resignations, scope]
  );

  // One Year Connects has no Delivery Lead field (it tracks Business Head /
  // HRBP instead), so it's scoped by connect-date-in-period only — the
  // Client/Delivery Lead filters above don't apply to this section.
  const scopedConnects = useMemo(
    () => connects.filter((c) => c.connectDate && c.connectDate >= period.start && c.connectDate <= period.end),
    [connects, period]
  );
  const connectCounts = useMemo(() => {
    const red = scopedConnects.filter((c) => c.ewsMarking === "RED").length;
    const amber = scopedConnects.filter((c) => c.ewsMarking === "AMBER").length;
    const green = scopedConnects.filter((c) => c.ewsMarking === "GREEN").length;
    return { red, amber, green, total: scopedConnects.length };
  }, [scopedConnects]);

  // ---- Grievances, scoped by client only (no delivery-lead field on GrievanceRecord) ----
  const scopedGrievances = useMemo(
    () => grievances.filter((g) => !scope.client || g.client === scope.client),
    [grievances, scope.client]
  );
  const grievanceCounts = useMemo(
    () => ({
      open: scopedGrievances.filter((g) => g.status === "Open").length,
      inProgress: scopedGrievances.filter((g) => g.status === "In Progress").length,
      closed: scopedGrievances.filter((g) => g.status === "Closed").length,
      high: scopedGrievances.filter((g) => g.severity === "High").length,
    }),
    [scopedGrievances]
  );

  const periodLabel = `${period.start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${period.end.toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }
  )}`;

  return (
    <div className="min-h-screen bg-[#f4f6f5] text-ink font-sans">
      <div className="mx-auto max-w-[1400px] px-6 pb-20">
        {/* 1. Header + filters + period switcher */}
        <header className="sticky top-0 z-30 bg-[#f4f6f5] pt-6 pb-2 border-b border-line">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">People Overview — Vivek Pai Span</h1>
              <p className="mt-1 text-sm text-ink-muted">
                HRBP: Alekhya <span className="mx-2 text-ink-faint">·</span> Delivery Head: Vivek Pai
                <span className="mx-2 text-ink-faint">·</span> Last refresh:{" "}
                <span className="font-mono">{new Date(lastRefreshed).toLocaleTimeString()}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-full border border-line bg-surface-sunken p-1" role="group" aria-label="Period">
                {(["week", "month", "ytd", "custom"] as PeriodPreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    aria-current={preset === p}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${
                      preset === p ? "bg-teal text-white font-semibold" : "text-ink-muted"
                    }`}
                  >
                    {p === "ytd" ? "YTD" : p}
                  </button>
                ))}
              </div>
              <span className="font-mono text-xs text-ink-faint">{periodLabel}</span>
            </div>
          </div>

          {preset === "custom" && (
            <div className="flex items-center gap-2 py-2 text-sm">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-md border border-line bg-white px-2 py-1"
              />
              <span className="text-ink-faint">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-md border border-line bg-white px-2 py-1"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line-soft py-3">
            <span className="font-mono text-[0.7rem] uppercase tracking-wider text-ink-faint">Scope</span>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium"
            >
              <option value="">All clients</option>
              {clientOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={deliveryLeadFilter}
              onChange={(e) => setDeliveryLeadFilter(e.target.value)}
              className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium"
            >
              <option value="">All delivery leads</option>
              {deliveryLeadOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {(clientFilter || deliveryLeadFilter) && (
              <button
                type="button"
                onClick={() => {
                  setClientFilter("");
                  setDeliveryLeadFilter("");
                }}
                className="text-sm text-ink-faint underline underline-offset-2"
              >
                Clear filters
              </button>
            )}
          </div>
        </header>

        {/* 2. KPI strip */}
        <section className="pt-10">
          <p className="mb-3 font-mono text-[0.72rem] uppercase tracking-wider text-ink-faint">
            Executive summary — {periodLabel}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <KpiTile label="Opening Headcount" value={String(metrics.openingHeadcount)} sub="active headcount on the day before start, scoped to current filters" />
            <KpiTile
              label="Closing Headcount"
              value={String(metrics.closingHeadcount)}
              sub={`${metrics.netChange >= 0 ? "+" : ""}${metrics.netChange} net this period`}
              subClass="text-teal"
            />
            <KpiTile
              label="Exits"
              value={String(metrics.exits)}
              sub={`${metrics.voluntaryExits} voluntary · ${metrics.involuntaryExits} involuntary`}
              subClass="text-teal"
            />
            {metrics.resignationsReceived !== null ? (
              <KpiTile label="Resignations Received" value={String(metrics.resignationsReceived)} sub="RAD in range — Resignations tab" />
            ) : (
              <KpiTile blocked label="Resignations Received" value="Awaiting data" sub="needs resignation date column" />
            )}
            {metrics.inNoticePipeline !== null ? (
              <KpiTile label="In-Notice Pipeline" value={String(metrics.inNoticePipeline)} sub="expected LWD still in the future, as of today" />
            ) : (
              <KpiTile blocked label="In-Notice Pipeline" value="Awaiting data" sub="needs status signal" />
            )}
            {metrics.resignationsWithdrawn !== null ? (
              <KpiTile label="Resignations Withdrawn" value={String(metrics.resignationsWithdrawn)} sub="in selected period" />
            ) : (
              <KpiTile blocked label="Resignations Withdrawn" value="Not trackable yet" sub="no withdrawal signal in the sheet" />
            )}
            <div className="rounded-[10px] bg-gradient-to-br from-teal to-teal-ink p-4 text-white shadow-sm">
              <div className="text-[0.74rem] font-medium text-white/80">Attrition — this period</div>
              <div className="mt-1 font-mono text-[1.65rem] font-semibold tabular-nums">{fmtPct(metrics.attritionPct)}</div>
              <div className="mt-1 text-[0.74rem] text-white/80">
                target {TARGET_ATTRITION_PCT}% · exits ÷ avg(opening HC, closing HC)
              </div>
            </div>
          </div>
        </section>

        {/* 3+4. Trend chart & exit reasons */}
        <section className="grid grid-cols-1 gap-5 pt-10 lg:grid-cols-2">
          <div className="rounded-[10px] border border-line bg-white p-5 shadow-sm">
            <h2 className="font-display text-base font-bold">Exits &amp; Resignations, trailing 12 months</h2>
            <p className="mb-2 text-xs text-ink-faint">bar = count · line = attrition %</p>
            <TrendChart points={trendPoints} />
          </div>
          <div className="rounded-[10px] border border-line bg-white p-5 shadow-sm">
            <h2 className="font-display text-base font-bold">Exit reasons, trend by month</h2>
            <p className="mb-2 text-xs text-ink-faint">stacked as % of that month&apos;s exits, not raw counts</p>
            <ExitReasonsChart points={exitReasonPoints} categories={reasonCategories} />
          </div>
        </section>

        {/* 5. Monthly running point */}
        <section className="pt-10">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-bold">Monthly running point</h2>
            <span className="text-xs text-ink-faint">
              always trailing 12 months — the one table the period switcher doesn&apos;t collapse
            </span>
          </div>
          <div className="overflow-x-auto rounded-[10px] border border-line bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[0.7rem] uppercase tracking-wide text-ink-faint">
                  <Th>Month</Th>
                  <Th align="right">Exits</Th>
                  <Th align="right">Exit % MTD</Th>
                  <Th align="right">YTD Attrition %</Th>
                  <Th align="right">Resig. Received</Th>
                  <Th align="right">Resig. %</Th>
                  <Th align="right">Withdrawn</Th>
                  <Th align="right">Withdrawal %</Th>
                </tr>
              </thead>
              <tbody>
                {monthlyMetrics.map(({ month, metrics: m, ytdToMonth }, i) => {
                  const avgHc = (m.openingHeadcount + m.closingHeadcount) / 2;
                  const resigPct = m.resignationsReceived !== null && avgHc > 0 ? (m.resignationsReceived / avgHc) * 100 : null;
                  const withdrawnPct =
                    m.resignationsWithdrawn !== null && m.resignationsReceived
                      ? (m.resignationsWithdrawn / m.resignationsReceived) * 100
                      : null;
                  const isCurrent = i === monthlyMetrics.length - 1;
                  return (
                    <tr key={month.label} className={`border-b border-line-soft font-mono tabular-nums ${isCurrent ? "bg-teal-soft" : ""}`}>
                      <Td className="font-sans">{month.label}</Td>
                      <Td align="right">{m.exits}</Td>
                      <Td align="right">{fmtPct(m.attritionPct)}</Td>
                      <Td align="right">{fmtPct(ytdToMonth.attritionPct)}</Td>
                      <Td align="right">{m.resignationsReceived ?? "—"}</Td>
                      <Td align="right">{resigPct !== null ? fmtPct(resigPct) : "—"}</Td>
                      <Td align="right">{m.resignationsWithdrawn ?? "—"}</Td>
                      <Td align="right">{withdrawnPct !== null ? fmtPct(withdrawnPct) : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 6. Data cuts */}
        <section className="pt-10">
          <h2 className="font-display text-base font-bold">Data cuts</h2>
          <p className="mb-3 text-xs text-ink-faint">
            Client · Band · PG Rating — sorted by YTD attrition % desc, regardless of switcher
          </p>
          <p className="mb-4 text-xs text-ink-faint">
            <strong className="font-semibold text-ink-muted">Closing HC</strong> = headcount at the end of the
            currently selected period, scoped to that row. Three percentage columns:{" "}
            <strong className="font-semibold text-ink-muted">MTD</strong> (fixed, current calendar month),{" "}
            <strong className="font-semibold text-ink-muted">Period</strong> (reacts to the switcher),{" "}
            <strong className="font-semibold text-ink-muted">YTD</strong> (fixed, Apr 1 → today — drives sort order).
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <CutTable title="By Client" rows={byClient} />
            <CutTable title="By Band / Grade" rows={byBand} />
            <CutTable title="By PG Rating" rows={byPgRating} />
          </div>
        </section>

        {/* 6a. Cross-tabs */}
        <section className="pt-10">
          <h2 className="font-display text-base font-bold">Cross-tabs &amp; derived insight</h2>
          <p className="mb-4 text-xs text-ink-faint">
            Scoped to the currently selected period and Client/Delivery Lead filters — never a fixed &quot;overall&quot;
            number, same as everything else above.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-[10px] border border-line bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">Delivery Lead ranking</h3>
              <p className="mb-3 text-xs text-ink-faint">attrition % for the selected period, scoped per Delivery Lead</p>
              {leadRanking.length === 0 ? (
                <p className="text-sm text-ink-faint">No exits in this scope/period.</p>
              ) : (
                leadRanking.map((r) => (
                  <div key={r.label} className="flex items-center justify-between border-b border-line-soft py-1.5 text-sm last:border-0">
                    <span>{r.label}</span>
                    <span className="font-mono font-medium text-risk-red">{fmtPct(r.attritionPct)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="rounded-[10px] border border-line bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">Tenure-band exits</h3>
              <p className="mb-3 text-xs text-ink-faint">early (&lt;1yr, onboarding signal) vs. tenured (2yr+, growth-ceiling signal)</p>
              {tenureDist.length === 0 ? (
                <p className="text-sm text-ink-faint">No exits in this scope/period.</p>
              ) : (
                tenureDist.map((r) => (
                  <div key={r.bucket} className="flex items-center justify-between border-b border-line-soft py-1.5 text-sm last:border-0">
                    <span>{r.bucket}</span>
                    <span className="font-mono font-medium text-risk-red">{r.pctOfExits.toFixed(0)}%</span>
                  </div>
                ))
              )}
            </div>
            <div className="rounded-[10px] border border-line bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">PG Rating vs. Exit</h3>
              <p className="mb-3 text-xs text-ink-faint">Latest QPR/PG Rating of this period&apos;s exits (unrated exits excluded)</p>
              {pgSplit.knownCount === 0 ? (
                <p className="text-sm text-ink-faint">No rated exits in this scope/period.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-line-soft py-1.5 text-sm">
                    <span>Top-band (PG1–PG2)</span>
                    <span className="font-mono font-medium text-risk-red">{pgSplit.topBandPct.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line-soft py-1.5 text-sm">
                    <span>Mid-band (PG3)</span>
                    <span className="font-mono font-medium text-risk-red">{pgSplit.midBandPct.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 text-sm">
                    <span>Bottom-band (PG4–PG5)</span>
                    <span className="font-mono font-medium text-risk-red">{pgSplit.bottomBandPct.toFixed(0)}%</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* 7. Leadership takeaways */}
        <section className="pt-10">
          <h2 className="font-display text-base font-bold">Leadership takeaways</h2>
          <div className="mt-3 flex gap-3 rounded-[10px] border border-teal-softBorder bg-teal-soft p-5">
            <span className="text-xl leading-none text-teal">→</span>
            <div>
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-teal-ink">
                {takeaways.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[0.72rem] text-ink-faint">
                plain if/else rules over computePeriodMetrics() output — zero AI, zero external API calls, changes
                automatically as the sheet or the selected period/filters change.
              </p>
            </div>
          </div>
        </section>

        {/* 8. Exit log */}
        <section className="pt-10">
          <h2 className="font-display text-base font-bold">Attrition detail — exit log</h2>
          <p className="mb-3 text-xs text-ink-faint">exits in the selected period and scope</p>
          <div className="overflow-x-auto rounded-[10px] border border-line bg-white shadow-sm">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[0.7rem] uppercase tracking-wide text-ink-faint">
                  <Th>Name</Th>
                  <Th>Band</Th>
                  <Th>Client</Th>
                  <Th>Team</Th>
                  <Th>Type</Th>
                  <Th align="right">Tenure</Th>
                  <Th>Reason</Th>
                  <Th>Exit Date</Th>
                </tr>
              </thead>
              <tbody>
                {metrics.exitRows.length === 0 ? (
                  <tr>
                    <Td colSpan={8} className="py-6 text-center text-ink-faint">
                      No exits in this scope/period.
                    </Td>
                  </tr>
                ) : (
                  metrics.exitRows.map((e) => (
                    <tr key={e.id} className="border-b border-line-soft">
                      <Td className="font-medium">{e.name}</Td>
                      <Td>{e.band}</Td>
                      <Td>{e.client}</Td>
                      <Td>{e.team}</Td>
                      <Td>
                        {e.voluntary === true && (
                          <span className="rounded bg-teal-soft px-2 py-0.5 text-xs font-medium text-teal-ink">Voluntary</span>
                        )}
                        {e.voluntary === false && (
                          <span className="rounded bg-risk-redSoft px-2 py-0.5 text-xs font-medium text-risk-red">Involuntary</span>
                        )}
                      </Td>
                      <Td align="right" className="font-mono tabular-nums">
                        {e.tenureYears !== null ? `${e.tenureYears.toFixed(1)}y` : "—"}
                      </Td>
                      <Td>{e.reasonCategory ?? "—"}</Td>
                      <Td className="font-mono tabular-nums">{fmtDate(e.exitDate)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 9. Resignation / in-notice detail */}
        <section className="pt-10">
          <h2 className="font-display text-base font-bold">Resignation detail — in-notice pipeline</h2>
          <p className="mb-3 text-xs text-ink-faint">
            from the Resignations tab — status derived from expected LWD (see footer note). Not filtered by the
            period switcher; this is current pipeline state.
          </p>
          <div className="overflow-x-auto rounded-[10px] border border-line bg-white shadow-sm">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[0.7rem] uppercase tracking-wide text-ink-faint">
                  <Th>Name</Th>
                  <Th>Band</Th>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th>Resignation Date</Th>
                  <Th>Expected LWD</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {scopedResignations.length === 0 ? (
                  <tr>
                    <Td colSpan={7} className="py-6 text-center text-ink-faint">
                      No records in this scope.
                    </Td>
                  </tr>
                ) : (
                  scopedResignations.map((r) => (
                    <tr key={r.id} className="border-b border-line-soft">
                      <Td className="font-medium">{r.name}</Td>
                      <Td>{r.band}</Td>
                      <Td>{r.client}</Td>
                      <Td>
                        {r.status && (
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${
                              r.status === "Serving Notice" ? "bg-risk-amberSoft text-risk-amber" : "bg-teal-soft text-teal-ink"
                            }`}
                          >
                            {r.status}
                          </span>
                        )}
                      </Td>
                      <Td className="font-mono tabular-nums">{fmtDate(r.resignationDate)}</Td>
                      <Td className="font-mono tabular-nums">{fmtDate(r.expectedLwd)}</Td>
                      <Td>{r.reasonCategory || "—"}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 10. PIP + Grievance */}
        <section className="pt-10">
          <h2 className="font-display text-base font-bold">Performance &amp; Employee Relations</h2>
          <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-[10px] border border-line bg-white shadow-sm">
              <div className="grid grid-cols-4 gap-2 p-4">
                <MiniKpi n={pipSummary.totalActive} l="Active PIPs" />
                <MiniKpi n={pipSummary.newThisMonth} l="New this month" />
                <MiniKpi n={pipSummary.successRate !== null ? `${pipSummary.successRate.toFixed(0)}%` : "—"} l="Success rate" />
                <MiniKpi n={pipSummary.overdueReviews} l="Overdue review" />
              </div>
              <div className="space-y-2 px-4 pb-4">
                {pipCases.length === 0 ? (
                  <p className="text-sm text-ink-faint">No PIP cases logged.</p>
                ) : (
                  pipCases.map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md bg-surface-sunken px-3 py-2 text-sm">
                      <span className="font-medium">
                        {c.employeeName} — {c.band}, {c.team}
                      </span>
                      <span className="text-xs text-ink-faint">{c.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-[10px] border border-line bg-white shadow-sm">
              <div className="grid grid-cols-4 gap-2 p-4">
                <MiniKpi n={grievanceCounts.open} l="Open" />
                <MiniKpi n={grievanceCounts.inProgress} l="In progress" />
                <MiniKpi n={grievanceCounts.closed} l="Closed" />
                <MiniKpi n={grievanceCounts.high} l="High severity" />
              </div>
              <div className="space-y-2 px-4 pb-4">
                {scopedGrievances.length === 0 ? (
                  <p className="text-sm text-ink-faint">No grievances logged for this scope.</p>
                ) : (
                  scopedGrievances
                    .filter((g) => g.status !== "Closed")
                    .map((g, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md bg-surface-sunken px-3 py-2 text-sm">
                        <span className="font-medium">
                          {g.category} — {g.client}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide ${
                            g.severity === "High"
                              ? "bg-risk-redSoft text-risk-red"
                              : g.severity === "Medium"
                                ? "bg-risk-amberSoft text-risk-amber"
                                : "bg-teal-soft text-teal-ink"
                          }`}
                        >
                          {g.severity}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 10a. One Year Connects — flight risk */}
        <section className="pt-10">
          <h2 className="font-display text-base font-bold">One Year Connects — flight risk</h2>
          <p className="mb-3 text-xs text-ink-faint">
            retention connects completed in the selected period — not in the original PRD, added per HRBP request
          </p>
          <div className="rounded-[10px] border border-line bg-white shadow-sm">
            <div className="grid grid-cols-4 gap-2 p-4">
              <MiniKpi n={connectCounts.total} l="Connects completed, this period" />
              <MiniKpi n={connectCounts.red} l="RED" nClass="text-risk-red" />
              <MiniKpi n={connectCounts.amber} l="AMBER" nClass="text-risk-amber" />
              <MiniKpi n={connectCounts.green} l="GREEN" nClass="text-teal-ink" />
            </div>
            <div className="space-y-2 px-4 pb-4">
              {scopedConnects.length === 0 ? (
                <p className="text-sm text-ink-faint">No connects completed in this period.</p>
              ) : (
                scopedConnects.map((c) => (
                  <div key={c.id} className="rounded-md bg-surface-sunken px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {c.name} — {c.band}, {c.team}
                      </span>
                      {c.ewsMarking && (
                        <span
                          className={`rounded px-2 py-0.5 text-[0.68rem] font-bold ${
                            c.ewsMarking === "RED"
                              ? "bg-risk-redSoft text-risk-red"
                              : c.ewsMarking === "AMBER"
                                ? "bg-risk-amberSoft text-risk-amber"
                                : "bg-teal-soft text-teal-ink"
                          }`}
                        >
                          {c.ewsMarking}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-faint">
                      Connect date {fmtDate(c.connectDate)} · HRBP: {c.hrbp}
                    </div>
                    {c.comments && <div className="mt-1.5 text-sm text-ink-muted">{c.comments}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* 11. People updates */}
        <section className="pt-10">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-bold">People updates</h2>
            <span className="text-xs text-ink-faint">not from the sheet — see note below</span>
          </div>
          <div className="rounded-[10px] border border-line bg-white shadow-sm">
            <ul className="space-y-2 p-5 text-sm">
              {[...PEOPLE_UPDATES]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((u, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex-none text-ink-faint">—</span>
                    <span>{u.text}</span>
                  </li>
                ))}
            </ul>
            <p className="px-5 pb-4 text-xs text-ink-faint">
              Source: a small manually-edited config file (config/people-updates.ts) HRBP updates directly — no sheet
              tab backs this section (PRD §7.11/§10).
            </p>
          </div>
        </section>
      </div>

      <footer className="mx-auto max-w-[1400px] border-t border-line px-6 py-8 text-xs leading-relaxed text-ink-faint">
        <p>
          <strong className="font-semibold text-ink-muted">Period + filters are global.</strong> Client, Delivery
          Lead, and the Weekly/Monthly/YTD/Custom switcher all feed the same computePeriodMetrics() call. Only the
          Monthly Running-Point table stays trailing-12-months regardless of switcher, since it&apos;s a trend view by
          design.
        </p>
        <p className="mt-2">
          <strong className="font-semibold text-ink-muted">Resignations Withdrawn</strong> stays &quot;Not trackable
          yet&quot; — the Resignations tab has RAD/expected-LWD but no withdrawal signal (a withdrawn row is
          presumably just deleted). Reporting 0 would falsely claim &quot;confirmed zero withdrawals.&quot;
        </p>
        <p className="mt-2">
          MediaMint teal is the only brand accent used throughout; red/amber are semantic (risk/attention) and kept
          separate from it.
        </p>
      </footer>
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  subClass,
  blocked,
}: {
  label: string;
  value: string;
  sub: string;
  subClass?: string;
  blocked?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-white p-4 shadow-sm">
      <div className="text-[0.74rem] font-medium text-ink-muted">{label}</div>
      <div className={`mt-1 font-mono tabular-nums ${blocked ? "text-[1.05rem] font-medium text-ink-faint" : "text-[1.65rem] font-semibold"}`}>
        {blocked && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-risk-amber align-middle" />}
        {value}
      </div>
      <div className={`mt-1 text-[0.74rem] ${subClass ?? "text-ink-faint"}`}>{sub}</div>
    </div>
  );
}

function MiniKpi({ n, l, nClass }: { n: number | string; l: string; nClass?: string }) {
  return (
    <div className="text-left">
      <div className={`font-mono text-xl font-semibold tabular-nums ${nClass ?? ""}`}>{n}</div>
      <div className="text-[0.7rem] text-ink-faint">{l}</div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({
  children,
  align = "left",
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}

function CutTable({ title, rows }: { title: string; rows: ReturnType<typeof computeDataCut> }) {
  return (
    <div className="rounded-[10px] border border-line bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-ink-faint">sorted, highest YTD attrition first</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[0.68rem] uppercase tracking-wide text-ink-faint">
              <Th>{title.replace("By ", "")}</Th>
              <Th align="right">Closing HC</Th>
              <Th align="right">Exits</Th>
              <Th align="right">MTD</Th>
              <Th align="right">Period</Th>
              <Th align="right">YTD</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={6} className="py-4 text-center text-ink-faint">
                  No data in this scope.
                </Td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.label} className="border-b border-line-soft font-mono tabular-nums last:border-0">
                  <Td className="font-sans">{r.label}</Td>
                  <Td align="right">{r.closingHeadcount}</Td>
                  <Td align="right">{r.exits}</Td>
                  <Td align="right">{fmtPct(r.attritionPctMtd)}</Td>
                  <Td align="right">
                    <span className={`rounded-full px-2 py-0.5 ${pctPillClass(r.attritionPctPeriod, TARGET_ATTRITION_PCT)}`}>
                      {fmtPct(r.attritionPctPeriod)}
                    </span>
                  </Td>
                  <Td align="right">{fmtPct(r.attritionPctYtd)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
