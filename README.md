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
cp .env.example .env.local   # fill in real values
npm run dev
```

Required env vars (Appendix §C): `GOOGLE_SERVICE_ACCOUNT_KEY`,
`GOOGLE_SHEET_ID`. See `.env.example` for the rest.

## Open items carried forward from the PRD (§10)

Not blockers for Phase 1, but flagged per the kickoff prompt rather than
silently worked around:

1. **Resignation Tracker has no date/status columns yet.** `resignationDate`,
   `status`, `withdrawalDate` on `ResignationRecord` are `null` until HRBP
   adds `Resignation Date`, `Status`, `Withdrawal Date` to the
   `📉 Resignation Tracker` tab. `computePeriodMetrics()` already returns
   `null` for the three resignation-derived fields in that case — verified
   by test — so the UI can show "Awaiting data" once built, per PRD §4.
2. **FY_START_MONTH** defaults to `4` (April) per `config/constants.ts`,
   overridable via env var — confirm with HRBP before this becomes visible
   in a YTD number.
3. Country cut, People Updates tab, and the email-send provider (Resend vs.
   Apps Script) are still open per PRD §10 items 3–5 — none block the data
   layer, will surface again at the relevant build phase.

## Next: Phase 2

KPI tiles + period switcher + trend chart, per PRD §12.
