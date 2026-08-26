# PRD — HRBP Leadership Dashboard (Vivek Pai Span)
**Prepared for:** Claude Code build
**Prepared by:** HRBP Analytics (via Claude)
**Status:** Ready for build — see "Open Questions & Blockers" before Phase 1
**Reference materials analyzed:** Alekhya_August_HRBP_Tracker.xlsx (13-tab source), HR_monthly_updates_August_2026.eml (existing Apps Script email), People_Overview_Deck.pptx (8-slide HRBP-prepared deck), Bench Health Review reference screenshot

---

## 1. Product summary

A live, single-page (multi-section) web dashboard that replaces manual weekly deck preparation for the Vivek Pai span leadership connect. It reads directly from the team's Google Sheet, recomputes attrition/resignation/headcount metrics for any selected period, and becomes the **running artifact for weekly leadership meetings** — replacing the currently hand-built PowerPoint deck and matching/exceeding the data richness of the existing monthly email.

This is a **single-span v1** (Vivek Pai only, no delivery-head filter). Data model must be built so a delivery-head/span filter can be added later without a schema rewrite.

> **Template vs. sample data — read this before writing any component.** The PPTX deck and reference email analyzed for this PRD are **real snapshots of a single week/month**, used only to determine *shape, tone, and data cuts* leadership already expects. No number from those files (553 headcount, 6 exits, "83% compensation," etc.) may be hardcoded anywhere in the app — not as a default, not as a placeholder, not as a fallback if a fetch fails. Every figure rendered must trace back to a live computation against the currently selected period. If a component needs a loading or empty state, use a skeleton/spinner or an explicit "No data for this range" message — never a plausible-looking fake number.

## 2. Goals

- Eliminate manual deck-building time for the weekly connect
- Give leadership one place to see: current state, trend over time, and "what to discuss this week"
- Make attrition % mathematically correct for **any client, any date range** — not just pre-baked monthly rollups (this is the specific gap in the current Looker/email approach)
- Preserve everything the current PPTX deck and email already do well; don't regress functionality
- Support manual send-to-leader today, with the architecture ready for scheduled auto-send later

## 3. Non-goals (v1)

- Delivery-head / multi-span filtering (schema-ready, UI deferred)
- Automatic scheduled email sending (manual trigger only, this phase)
- Editing data from the dashboard (read-only; all data entry stays in the Sheet)
- SSO — a simple shared-password gate is sufficient for v1 (see NFRs)

---

## 4. Data source & access model

**Source of truth:** Google Sheet (converted from `Alekhya_August_HRBP_Tracker.xlsx`), same workbook already in use, containing the tabs below.

**Access method — do NOT use "Publish to web" CSV.** The exit/resignation notes contain named individuals' compensation figures, health information, and family circumstances. Publishing to web makes that world-readable to anyone with the link, indexable, and outside any access control.

Instead:
- Create a **Google Cloud service account**, share the Sheet with its email as Viewer
- Server-side (Next.js API routes / route handlers only — never client-side) call the **Google Sheets API v4** (`spreadsheets.values.get`) using the service account's JSON key stored as a Vercel environment variable (`GOOGLE_SERVICE_ACCOUNT_KEY`, base64- or JSON-encoded)
- No sheet data ever reaches the browser except what the dashboard explicitly renders

### 4.1 Tabs consumed and their schemas

**`Headcount Overview`** (active roster, ~553 rows, header row 1, data from row 2)
Key columns used: `MM ID`, `Full name`, `Gender`, `Grade`(Band), `Employee type`, `Date Of Joining/Permanent`(DOJ), `Service Area`, `Job Location`, `TEAM`, `CLIENT_NAME`, `Billing type`, `Delivery Lead`, `Tenure`, `Tenure Bracket`, `Delivery Head`, `HRBP`, `BAND`, `Latest QPR Rating`(PG rating), `Latest PG`

> ⚠️ **Known data-quality issue:** `Tenure Bracket` column stores bracket labels ("0-1", "1-2") as Excel dates in some rows (e.g. renders as `2026-01-02`). Do not read this column directly — recompute tenure bracket in the app from the numeric `Tenure` column instead (e.g. `<1yr`, `1-2yr`, `2-3yr`, `3-5yr`, `5yr+`). This avoids depending on corrupted source formatting.

> ⚠️ **No `Country` column exists** in the current Headcount Overview tab (implicitly all India). The reference email's "Country" cut is from a different, larger org-wide report. Either omit Country from this v1 (recommended — there's nothing to cut by), or confirm with HRBP whether this span has any non-India headcount before building that table.

**`Attrition Tracker`** (confirmed exits — LWD has occurred), header row 1, data from row 2
Columns: `MMID`, `Name`, `Status`, `DOJ`, `Grade`, `Gender`, `Exit Type`, `LWD`, `DOE Year`, `DOE Month`, `Team`, `Client`, `Delivery Head`, `Tenure`, `Tenurity`, `Role/Function`, `Voluntary/Involutnary`, `Detailed Reason`, `Reasons Category`, `Quarter`, `PG Rating`, `Next Company`, `Package offered`, `Current Package`, `Hike%`

This is your **exits log** — use `LWD` as the date an exit counts against a period.

**`📉 Resignation Tracker`** (mislabeled internally as "ATTRITION TRACKER" but functions as the **resignation log** — 6 rows currently, matches the deck's "Resignation Log")
Columns: `Sr No`, `Employee ID`, `Employee Name`, `Band/Level`, `Client`, `Team`, `Delivery Lead`, `Exit Type`, `Tenure (Years)`, `Primary Exit Reason`, `Notes`

> 🚫 **Blocker — no date field.** This tab has no "Resignation Received Date," no "Expected LWD," and no status field (Serving Notice / Withdrawn / Converted to Exit / Absconded). Without dates, **"Resignations Received MTD/YTD," "In Notice pipeline," and "Resignations Withdrawn %" cannot be computed** — there's nothing to filter by period. See §10 Open Questions — this needs three new columns added to the source sheet before that part of the dashboard can show real numbers. Build the UI for this section now; wire it to real data once columns exist; show "Awaiting data — see HRBP" state in the interim rather than a fabricated number.

**`Grievance Tracker`** (title row 1, header row 2, data from row 3)
Columns: `Employee ID`, `Employee Name`, `Client`, `Grievance Category`, `Description`, `Severity`, `Date Raised`, `Status`, `Closure Date`

**`📈 PIP Register`** — summary auto-calc block at row 6 (`Total Active PIPs`, `New This Month`, `Closed – Success`, `Closed – Extended`, `Closed – Exit Initiated`, `Overdue Reviews`, `Success Rate`), plus a detail log below with `PIP Start Date`, `PIP End Date`, `Status`, milestone tracking.

---

## 5. Core calculation spec — this is the part that matters most

### 5.1 Headcount at a point in time
For any date `T`, an employee (from the **union** of Headcount Overview + Attrition Tracker, so exited people are still counted for past dates) is employed if:
```
DOJ ≤ T   AND   (LWD is empty  OR  LWD > T)
```

### 5.2 Attrition % — exact formula (as specified)
```
Attrition % = Exits in [start, end]  ÷  Average Headcount

Average Headcount = ( OpeningHC + ClosingHC ) / 2

OpeningHC = headcount(day before `start`), scoped to the same filter (client/team/etc.)
ClosingHC = headcount(`end`),              scoped to the same filter
Exits     = count of Attrition Tracker rows where LWD is in [start, end]
            AND the row matches the same scope filter (client/team/etc.)
```
**Scoping is mandatory, not optional.** If the user has selected "Client = Hulu," both the exits count AND the opening/closing headcount must be filtered to Hulu only — this is the exact bug this rebuild exists to fix (Looker Studio couldn't do the scoped opening/closing reconstruction). Every data-cut table (§7.4) must use this same function per row, not a global number repeated.

### 5.3 Resignation % / Withdrawn % (blocked — see §4, §10)
Once date + status fields exist on the Resignation tab:
```
Resignation % = Resignations Received in [start, end] ÷ Average Headcount (same scoping rule)
Withdrawal %  = Resignations Withdrawn in [start, end] ÷ Resignations Received in [start, end]
In-Notice pipeline = count where Status = "Serving Notice" as of `end` date
```

### 5.4 Period definitions
- **MTD:** 1st of current month → today (or → selected end date if a past month is chosen)
- **YTD:** Financial year start → today. **Confirm FY start with HRBP** — reference email shows "FY-to-date attrition (Apr 2026 – today)," implying **April–March FY**. Build with `FY_START_MONTH = 4` as a config constant, not hardcoded inline, so it's a one-line change if wrong.
- **Weekly:** ISO week, Mon–Sun
- **Custom:** any start/end date pair, inclusive

---

## 6. Information architecture

Single scrollable dashboard (matches the "one overview page" ask), sections in this order — each maps to a deck slide or email section so nothing leadership currently sees is lost:

| Section | Source of truth for content |
|---|---|
| 1. Header + period switcher | New |
| 2. Executive KPI tile strip | Deck slide 2 + email header |
| 3. Trend chart (hires/exits/withdrawals/attrition%) | Email trend chart, reference screenshot |
| 4. Exit reasons trend | Email "Exit reasons" section |
| 5. Overview summary table (month-wise) | New — explicitly requested |
| 6. Data-cut tables (client, team, grade, tenure, billing type, PG rating) | Deck slide 3 + email "Breakdown by data cut" |
| 7. Leadership takeaways (auto-generated) | Deck slide 2 "Key Leadership Takeaways" |
| 8. Attrition detail — exit log | Deck slide 4 |
| 9. Resignation detail — resignation log | Deck slide 5 (blocked pending data, §4) |
| 10. Performance & Employee Relations (PIP + Grievances) | Deck slides 6–7 |
| 11. People updates / notes | Deck slide 8 |
| 12. Export & email panel | New |

---

## 7. Functional requirements by section

### 7.1 Header + period switcher
- Title: "People Overview — [Client Span Name]", subtitle showing HRBP name, Delivery Head (Vivek Pai), last data refresh timestamp
- Period switcher: pill buttons **Weekly / Monthly / YTD / Custom**. Custom reveals two date inputs.
- All sections below re-render from this one selected range — single source of truth in page state, passed down, not re-fetched per section.

### 7.2 Executive KPI tile strip
Match the reference screenshot's tile set, computed for the **selected period**:
- Headcount (closing HC for period)
- New Hires
- Exits
- Resignations Withdrawn *(blocked, §4 — show placeholder state until data exists)*
- Resignations Received *(blocked, §4)*
- In Notice / total pipeline *(blocked, §4)*
- **Attrition (period)** — using §5.2 formula, visually emphasized (colored tile, matches reference)
- Add one the reference lacks: **Voluntary vs Involuntary split** as a small inline stat under Exits, since your deck emphasizes "100% voluntary" as a leadership talking point

### 7.3 Trend chart
Combo chart, one column-group per month (bar: hires green, exits red — matches reference exactly), overlaid line for attrition % on secondary y-axis. X-axis = trailing 12 months (or however many months of data exist). Tooltip on hover shows exact values per month. This is the single most-referenced chart in the current email — replicate its visual language closely (same teal/red palette, same "each column = one month" annotation).

### 7.4 Exit reasons trend
Not just a snapshot pie — build as a **stacked bar chart by month**, one color per `Reasons Category` (Compensation, Dissatisfied w/ Hike, Night Shift, Personal/Family, Health, Better Opportunity, Higher Education, etc. — derive the category list from actual `Reasons Category` values across both Attrition Tracker and Resignation Tracker, don't hardcode a fixed list that might miss a new reason). This directly satisfies "how the trend is going on each month with reasons in one chart."

### 7.5 Overview summary table
One table, rows = months (trailing 12), columns:
| Month | Exits | Exit % (MTD) | YTD Attrition % (cumulative to that month) | Resignations Received | Resignation % | Resignations Withdrawn | Withdrawal % |

This is the "running point" reference table for the weekly connect — the one leadership scans first.

### 7.6 Data-cut tables
One table per cut: **Client, Team, Grade/Band, Billing Type, Tenure Bracket (recomputed, §4), PG Rating**. Each table's columns:
| [Cut value] | Headcount (closing) | New Hires | Exits | Attrition % MTD | Attrition % YTD | Resignation % *(blocked)* | Resignation Withdrawn *(blocked)* |

Every row's Attrition % must use the scoped formula from §5.2 — this is the core value proposition of moving off Looker Studio. Sort each table by Attrition % YTD descending by default, so the highest-risk cut surfaces first without leadership needing to sort manually.

### 7.6a Cross-tabs & derived insights (Tier 1 — build in v1, no new data needed)

These cost nothing extra to build — same computation engine as §7.6, just a different `groupBy`/join key against columns that already exist on Headcount Overview and Attrition Tracker. Build these as additional cards/tables in the same section, not a separate phase:

- **Client × Band matrix** — attrition % per client, broken down by band within that client (surfaces whether attrition is concentrated at a specific level within a specific account, not just "Hulu is high").
- **Delivery Lead attrition ranking** — attrition % scoped per `Delivery Lead`, sorted descending, using the same §5.2 opening/closing-HC-per-scope logic. This is the "which lead's span is actually under pressure" view.
- **Tenure-band exit distribution** — % of period exits with tenure `<1yr`, `1-2yr`, `2-3yr`, `3-5yr`, `5yr+` (using the recomputed tenure bucket from §4.1, not the corrupted source column). Frame explicitly as "early attrition" (<1yr, an onboarding/fit signal) vs. "tenured attrition" (>2yr, a growth/ceiling signal) — these imply different leadership actions, so label them as such rather than a flat list.
- **Pyramid ratio over time** — band-mix ratio (e.g. Associate : Senior : Lead counts) computed for each of the trailing 12 months, rendered as a small trend, not just a current-state table. Shows if the org is top-heavying or thinning at senior levels over time.
- **Rating vs. exit correlation** — of this period's exits, what % had `Latest QPR Rating`/`PG Rating` in the top band vs. bottom band. This directly answers "are we losing our best people or managing out our weakest" — usually the first question leadership asks and currently unanswered anywhere in the deck or email.
- **Gender attrition parity** — exit rate by `Gender`, scoped the same way as any other cut, to flag if attrition skews disproportionately by gender relative to headcount mix.
- **Billing-type attrition** — attrition % scoped to `Billing type = Billed` specifically (separate from Floater/VAR/Training), since billed headcount is what leadership's margin conversations actually care about.

### 7.7 Leadership takeaways (auto-generated)
A small panel that computes 3–5 sentences algorithmically from the current period's data — not hardcoded text. Rules to implement:
- If one client/team accounts for >50% of period exits → flag it by name with the %
- If one reason category accounts for >60% of period exits → flag it (mirrors deck's "83% cite compensation")
- If attrition % this period > target (`Target Attrition %` from Attrition Tracker summary block, currently 15%) → flag as over-target
- If voluntary % of exits = 100% or involuntary exists → note the split
- Always state current headcount and period exit count as the first line

Keep this rule-based and transparent (no LLM call needed or wanted here) — leadership needs to trust the number is directly traceable to the data, not generated prose.

### 7.8 Attrition detail — exit log
Table of individual exits in the selected period: Name, Band, Client, Team, Exit Type (Voluntary/Involuntary), Tenure at exit, Reason Category, expandable row for the detailed note. **Redact compensation figures from any exported/emailed view by default** (toggle to show inline in-app only) — see NFR on sensitive data handling.

### 7.9 Resignation detail
Same shape as 7.8, sourced from the Resignation Tracker tab. Build the table now against current schema (no date filtering possible yet); once date/status columns are added, it inherits period filtering automatically — don't build two separate table components.

### 7.10 Performance & Employee Relations
Two compact side-by-side cards (matches deck slides 6–7 exactly): PIP summary tile row + active case list; Grievance summary tile row + case list with severity badges. Pull directly from the summary auto-calc rows already in those tabs — don't recompute in the app, they're already formula-driven in the sheet.

### 7.11 People updates
Simple free-text list section (matches deck slide 8) — read from a new tab or a designated range if HRBP wants this dashboard-editable later; for v1, can be a static array in the app config that HRBP updates via a small JSON/markdown file per week if no sheet tab exists for it yet. Flag to HRBP as an open question (§10).

### 7.12 Export & email panel
- **Download as slides**: button that generates a `.pptx` matching the current deck's visual structure (title slide, executive dashboard, headcount overview, attrition, resignations, performance, ER, updates) populated with the **currently selected period's** data. Use `pptxgenjs` (client-safe, works well in a Vercel serverless function) rather than a Python-based generator, to keep the stack single-language.
- **Send email (manual)**: a text input for one or more leader email addresses (comma-separated), a "Send" button that calls a server route which renders an HTML email in the same visual style as the existing Apps Script email (reuse its teal/gray palette, tile layout, and section structure — it's already a good template, don't redesign it) and sends via a transactional email provider (Resend recommended — simplest Vercel-native integration; needs `RESEND_API_KEY` env var and a verified sending domain). No scheduling logic yet — this is a synchronous "click, it sends now" action. Architecture should isolate the render-HTML function from the send-trigger, so a future cron/scheduled trigger can call the same render function without duplicating template code.

---

## 8. Tech stack

- **Framework:** Next.js 14 (App Router), TypeScript, deployed via GitHub → Vercel
- **Styling:** Tailwind CSS
- **Charts:** Recharts (combo bar+line, stacked bar)
- **Slide export:** `pptxgenjs`
- **Email:** Resend (or Nodemailer + existing Google Workspace SMTP if org policy prefers keeping it inside Google — confirm with HRBP, §10)
- **Data access:** `googleapis` npm package, Sheets API v4, service account auth, server-side only
- **Access control:** Vercel deployment protection (password) at minimum for v1, given confidential compensation/health data in the exit notes; do not rely on "security by obscurity" of an unlisted URL

## 9. Non-functional requirements

- **Confidentiality:** No sheet data reachable client-side except what's rendered. No compensation figures or health/personal notes in any exported PPTX or emailed HTML by default (toggle in-app view only, off by default in exports).
- **Freshness:** Every dashboard load fetches live from Sheets API (no build-time caching, no ISR beyond a short revalidate window of ~60s to avoid hitting Sheets API rate limits under repeated refreshes).
- **Performance:** Initial load < 2s on typical office wifi; period switch recalculation < 300ms (all computed client-side once roster JSON is fetched once).
- **Responsive:** Must render legibly on a conference-room screen/TV during the weekly connect, and on a laptop for prep — prioritize these two, mobile is a nice-to-have not a requirement.
- **Extensibility:** Every data type/interface includes a `deliveryHead`/`span` field from day one, even though the UI doesn't filter on it yet, so adding the filter later is additive, not a schema migration.

## 10. Open questions & blockers — resolve before/during build

1. **Resignation date & status fields don't exist yet.** Needs 3 new columns added to `📉 Resignation Tracker`: `Resignation Date`, `Status` (Serving Notice / Withdrawn / Converted to Exit / Absconded), `Withdrawal Date` (if applicable). Until added, build the UI but show "Awaiting data" rather than a wrong number.
2. **FY start month** — confirmed as April from the reference email, but confirm explicitly with HRBP before hardcoding.
3. **Country cut** — no data exists for this span currently; confirm whether to omit or whether non-India headcount exists that isn't in the current tab.
4. **People Updates section (slide 8)** — no sheet tab backs this currently; decide whether to add one or keep it as a manually-edited config file.
5. **Email sending method** — Resend (new, needs domain verification) vs. keeping it inside Google Workspace (Apps Script continues to own sending, this app only owns rendering/data). Cheaper/faster to keep sending in Apps Script if org email policy is strict — worth a decision before building the send button.
6. **Access control** — confirm Vercel password protection is sufficient, or whether this needs to sit behind actual company SSO given the sensitivity of contents.

## 10a. Roadmap — beyond v1 (do not build now, design data model so these aren't a rewrite)

**Tier 2 — unlocked once HRBP logs data into tabs that already exist but are empty today.** Build these sections now as visible placeholder cards using the same "Awaiting data" pattern as the resignation blocker (§4), so the dashboard visibly grows in capability as logging catches up, rather than appearing as a future rebuild:
- Pulse Survey → eNPS trend
- RMG Movement Log → bench aging, flight-risk flags
- L&D Tracker → completion vs. retention correlation
- PIP outcome/success-rate trend over time (not just current snapshot)

**Tier 3 — genuinely out of scope, needs new data collection design before it's buildable.** Do not build UI placeholders for these; just don't block them:
- Structured exit-interview scoring (today's notes are freeform text — rich for context, unusable for trend math without a taxonomy)
- Source-of-hire / referral tracking
- Market compensation benchmarking (comparing offer competitiveness, not just what they left for)
- A weighted predictive flight-risk score (tenure + rating + recent hike% + manager change) — needs a defined model spec before it's an engineering task

## 11. Acceptance criteria (v1 done means)

- [ ] Selecting Client = Hulu and a custom date range shows attrition % computed only from Hulu's opening/closing HC and Hulu's exits in that range — verified by hand against the source sheet for at least 2 test ranges
- [ ] Trend chart and exit-reasons chart both re-render correctly when period switcher changes
- [ ] All data-cut tables sorted by YTD attrition % descending by default
- [ ] Leadership takeaways panel text changes correctly when the underlying period/filter changes (no hardcoded strings)
- [ ] PPTX export downloads and opens correctly, structurally mirroring the current deck
- [ ] Manual email send successfully delivers to a test address with the correct period's data
- [ ] No compensation or health/personal detail visible in exported PPTX or sent email by default
- [ ] App is unreachable without the access gate

## 12. Suggested build phases

1. Data layer: Sheets API connection, TypeScript roster reconstruction (§5.1), scoped attrition function (§5.2) with unit tests against known values (e.g. August 2026 = 6 exits, 553 HC)
2. KPI tiles + period switcher + trend chart (core "does this even work" milestone)
3. Data-cut tables + exit reasons stacked chart
4. Leadership takeaways engine + exit/resignation detail tables
5. PIP/Grievance/Updates sections
6. PPTX export
7. Email send
8. Access gate + confidentiality redaction pass + acceptance testing against §11
