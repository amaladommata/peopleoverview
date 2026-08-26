Build the HRBP Leadership Dashboard described in `PRD_HRBP_Leadership_Dashboard.md`,
using the exact TypeScript interfaces, calculation function signature, env vars,
and column mappings in `APPENDIX_Data_Contracts.md`. Both files are in this repo.

Before writing code, confirm you understand:
1. The attrition formula in PRD §5.2 (exits ÷ average of opening+closing headcount,
   both scoped to the same filter as the exits count) — this is the entire reason
   this app exists instead of the previous Looker Studio version, so get this right
   before building anything else.
2. The PRD §4 note that no sheet data may be publicly published — use the Google
   Sheets API v4 with a service account, server-side only.
3. That every number rendered anywhere in the app must come from a live call to
   `computePeriodMetrics()` (Appendix §B) for the currently selected period —
   nothing from the reference deck/email may be hardcoded (PRD, top of §1).

Start with Phase 1 from PRD §12: data layer + the core calculation function with
unit tests verifying it against the real August 2026 numbers (553 headcount at
end of Headcount Overview, 6 exits in Attrition Tracker with LWD in August) before
building any UI. Stop and ask if the numbers don't match what's in the source
sheet — don't proceed to Phase 2 on an unverified calculation.

Flag back to me (not silently work around) if you hit:
- The Resignation Tracker date-field gap (PRD §4, §10.1)
- Any open question in PRD §10 you need an answer to before proceeding
- Any place the reference deck/email's numbers seem inconsistent with the raw
  sheet data, since the deck is a manually-assembled reference, not a source of truth
