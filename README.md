# People Overview — HRBP Leadership Dashboard

Live dashboard for the Vivek Pai span weekly leadership connect. Replaces the
manually-built PowerPoint deck and Looker Studio attrition numbers.

See `PRD_HRBP_Leadership_Dashboard.md` and `APPENDIX_Data_Contracts.md` (not
committed here — kept with the requesting team) for the full spec.

## Status: Phase 1 of 8 complete

Data layer + core calculation engine, per PRD §12 phase 1.

- `lib/types.ts` — the typed contracts (Appendix §A)
- `lib/attrition.ts` — `computePeriodMetrics()`, the single source of truth
  for every number in the app (Appendix §B, PRD §5.1–5.2)
- `lib/mappers.ts` / `lib/data-source.ts` / `lib/sheets-client.ts` /
  `lib/sheet-tabs.ts` — Sheets API v4 client (service account, server-only)
  and column mapping (Appendix §D–E)
- `app/api/*` — server-only route handlers, 60s revalidate via
  `unstable_cache`, never expose raw sheet data to the client

### Verified against the real sheet

`lib/__tests__/attrition.real-data.test.ts` runs the full
`rowsToRecords → buildRoster → computePeriodMetrics` pipeline against a real
export of the `Alekhya_August_HRBP_Tracker` workbook's Headcount Overview
(553 rows) and Attrition Tracker (6 rows) tabs (`lib/__fixtures__/`), and
confirms:

The fixture is **anonymized** before being committed: names, emails, exit
notes, and compensation figures are stripped (replaced with `Employee NNN`)
per PRD §4/§9 confidentiality requirements — only the fields the calculation
itself depends on (dates, client/team/band, tenure, voluntary/involuntary,
MM ID for dedup) are kept as real values.

- Closing headcount for August 2026 = **553**
- Exits with LWD in August 2026 = **6**, all voluntary
- Scoped attrition % (client = Hulu) is derived from Hulu's own
  opening/closing headcount and exits only — not the global average
  headcount divided into a filtered exit count. This scoped
  opening/closing-HC reconstruction is the specific gap this rebuild exists
  to fix (PRD §5.2).

Run `npm test` to reproduce.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in GOOGLE_SERVICE_ACCOUNT_KEY
npm run dev
```

Required env vars (Appendix §C): `GOOGLE_SERVICE_ACCOUNT_KEY`,
`GOOGLE_SHEET_ID`. `GOOGLE_SHEET_ID` for the real "Global Media & Creative -
People Dashboard" sheet is already filled in in `.env.example` — you still
need to create a Google Cloud service account, share that Sheet with its
email as Viewer, and set `GOOGLE_SERVICE_ACCOUNT_KEY` yourself; nothing here
can do that step for you.

## The live sheet has diverged from the PRD/Appendix

The source sheet was restructured after the PRD/Appendix were written.
`lib/sheet-tabs.ts` and `lib/mappers.ts` target the **live** structure
(verified 2026-09-02), which differs from the documented one:

| Concept | PRD/Appendix name | Live tab name | Notes |
|---|---|---|---|
| Active roster | `Headcount Overview` | `Employee Data - 29` | Confirmed a continuously-updated tab, not per-month. The `-29` suffix's stability is **unconfirmed** — if it ever changes, update `SHEET_TABS.headcount.name`. |
| Confirmed exits | `Attrition Tracker` | `Attrition` | Schema unchanged. |
| In-notice pipeline | `📉 Resignation Tracker` | `Resignations - August` | Confirmed to stay one continuous tab despite the "- August" in its name. Now has `RAD`/`LWD` date columns (the PRD §4/§10.1 blocker is resolved), but no `Status` column — see below. |
| Grievances | `Grievance Tracker` | *(doesn't exist yet)* | Will be added to this same sheet later, per HRBP. `getGrievances()` fails soft to `[]` on a missing-tab API error rather than erroring the whole dashboard. |
| PIP | `📈 PIP Register` (case log + auto-calc summary block) | `PIP` (case log only) | No summary block exists on the live tab — `computePipSummary()` derives it from case rows in code instead. |
| *(new)* | — | `One Year Connects - August` | Flight-risk/retention-connect tracker (RED/AMBER/GREEN), not in the original PRD. Added to dashboard scope per HRBP — `ConnectRecord` / `/api/connects`. |
| *(new)* | — | `Probation` | Probation tracker, not in the original PRD. Added to dashboard scope per HRBP — `ProbationRecord` / `/api/probation`. |

**Resignation status is derived, not read**, since the live tab has no
Status column: `ResignationRecord.status` is `"Serving Notice"` while
`expectedLwd` (from `LWD`) is in the future, `"Converted to Exit"` once it's
passed. `"Withdrawn"`/`"Absconded"` can never come out of this — nothing in
the sheet signals a withdrawal (a withdrawn row is presumably just deleted).
Correspondingly, `resignationsWithdrawn` on `PeriodMetrics` stays `null`
until some row actually carries a `withdrawalDate`, rather than reporting a
misleading `0`. See the comments on `ResignationRecord` in `lib/types.ts`
and `mapResignationRow` in `lib/mappers.ts`.

### Verified against the real sheet

`lib/__tests__/attrition.real-data.test.ts` runs the full
`rowsToRecords → buildRoster → computePeriodMetrics` pipeline against a real
export of the Headcount Overview (553 rows) and Attrition (6 rows) tabs
(`lib/__fixtures__/`), and confirms:

The fixture is **anonymized** before being committed: names, emails, exit
notes, and compensation figures are stripped (replaced with `Employee NNN`)
per PRD §4/§9 confidentiality requirements — only the fields the calculation
itself depends on (dates, client/team/band, tenure, voluntary/involuntary,
MM ID for dedup) are kept as real values.

- Closing headcount for August 2026 = **553**
- Exits with LWD in August 2026 = **6**, all voluntary
- Scoped attrition % (client = Hulu) is derived from Hulu's own
  opening/closing headcount and exits only — not the global average
  headcount divided into a filtered exit count. This scoped
  opening/closing-HC reconstruction is the specific gap this rebuild exists
  to fix (PRD §5.2).

`lib/__tests__/mappers.test.ts` covers the live-schema mappers: derived
resignation status, `computePipSummary`, EWS marking validation, and the
Probation tab's literal-newline header.

Run `npm test` to reproduce.

## "Auto-refresh whenever the sheet is updated"

Google Sheets API v4 has no push/webhook mechanism — there is no way for
this app to be notified the instant someone edits a cell. "Auto-refresh"
here means: every dashboard load re-fetches, and `unstable_cache` bounds
that to at most once per 60 seconds (Appendix §D) so repeated page loads
don't hammer the Sheets API rate limit. A change in the sheet shows up on
the next load after that window elapses — not instantly.

## Open items carried forward from the PRD (§10)

Not blockers for Phase 1, but flagged per the kickoff prompt rather than
silently worked around:

1. **FY_START_MONTH** defaults to `4` (April) per `config/constants.ts`,
   overridable via env var — confirmed with you as April 2026 → today for
   YTD.
2. Country cut and the email-send provider (Resend vs. Apps Script) are
   still open per PRD §10 items 3 and 5 — neither blocks the data layer,
   will surface again at the relevant build phase.
3. People Updates (PRD §10 item 4) will stay a manually-edited config file
   for v1, per the PRD's own recommendation, unless told otherwise.

## Next: Phase 2

KPI tiles + period switcher + client/delivery-lead filters + trend chart,
per PRD §12 and the layout preview reviewed with HRBP.
