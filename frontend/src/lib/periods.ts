/** Shared day-range options for every page with a "Period" picker.
 *
 *  "All time" isn't a special case server-side — it's just a day count large
 *  enough (100 years) to include everything a shop could plausibly have
 *  recorded, so `since = now - days` still does the filtering with no
 *  backend branch to keep in sync. */
export const ALL_TIME_DAYS = 36_500

export const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 180, label: 'Last 6 months' },
  { days: 365, label: 'Last year' },
  { days: ALL_TIME_DAYS, label: 'All time' },
] as const
