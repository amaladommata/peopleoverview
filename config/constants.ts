// FY start month for YTD calculations (PRD §5.4, Appendix C).
// 4 = April, per the reference email's "FY-to-date attrition (Apr–today)".
// Confirmed with HRBP as a one-line change if this is ever wrong — do not hardcode elsewhere.
export const FY_START_MONTH = Number(process.env.FY_START_MONTH ?? 4);

export const TARGET_ATTRITION_PCT = 15;
