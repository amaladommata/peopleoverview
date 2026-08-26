// Google Sheets (and Excel) serial date epoch: day 0 = 1899-12-30.
// We request values with valueRenderOption=UNFORMATTED_VALUE and
// dateTimeRenderOption=SERIAL_NUMBER so every date cell arrives as a
// number regardless of how it's displayed in the sheet (the source data
// mixes "2025-02-03", "8/25/2026", and "15-Jul-2024" display formats —
// serial numbers sidestep parsing all of them).
const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function serialToDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return null;
  return new Date(SERIAL_EPOCH_MS + n * MS_PER_DAY);
}
