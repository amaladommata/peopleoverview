import Dashboard from "@/components/Dashboard";
import { getConnects, getGrievances, getPip, getResignations, getRoster } from "@/lib/data-source";

export const dynamic = "force-dynamic";

// Server component: fetches everything once from the Sheets API (server
// side, per PRD §4 — never exposes raw sheet rows to the client, only the
// typed contracts). All period/filter recalculation happens client-side in
// <Dashboard> against this one fetched snapshot (PRD §9 — period switch
// recalculation <300ms, no re-fetch per section).
export default async function Home() {
  const [roster, resignations, grievances, pip, connects] = await Promise.all([
    getRoster(),
    getResignations(),
    getGrievances(),
    getPip(),
    getConnects(),
  ]);

  return (
    <Dashboard
      roster={roster}
      resignations={resignations}
      grievances={grievances}
      pipSummary={pip.summary}
      pipCases={pip.cases}
      connects={connects}
      lastRefreshed={new Date().toISOString()}
    />
  );
}
