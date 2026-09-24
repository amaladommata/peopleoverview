// People Updates (PRD §7.11 / §10 item 4). No sheet tab backs this section
// yet — HRBP updates this file directly each week. Not computed from
// computePeriodMetrics() like the rest of the dashboard.
export interface PeopleUpdate {
  date: string; // ISO date, for sorting — most recent first
  text: string;
}

export const PEOPLE_UPDATES: PeopleUpdate[] = [
  { date: "2026-09-01", text: "Samsung India QA T1 backfill in progress — 2 of 3 roles closed." },
  { date: "2026-08-28", text: "Hulu Local AdOps engagement survey scheduled for w/c Sep 1." },
  { date: "2026-08-20", text: "New HRBP office-hours slot added Thursdays for Bangalore-based team." },
];
