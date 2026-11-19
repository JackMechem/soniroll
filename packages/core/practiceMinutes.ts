import { formatMinutesShort } from "./practiceLog";

/*
 * Practice time for display, by one rule everywhere (the header, the day panel, the calendar,
 * the stats cards, the sidebar and the dashboard — on the website and the phone): sum first, then
 * round to the minute — except that practice that rounds to nothing reads "<1", never "0". The
 * streak and the heat map count any practice at all, so the numbers beside them shouldn't say
 * there was none.
 */

/** "<1", "15" — for "15 of 30 min" and other places with their own unit. */
export function practicedMinutes(minutes: number): string {
  if (minutes <= 0) return "0";
  const m = Math.round(minutes);
  return m === 0 ? "<1" : String(m);
}

/** "0 min", "<1 min", "15 min", "1 h 5 min". */
export function formatPracticed(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const m = Math.round(minutes);
  return m === 0 ? "<1 min" : formatMinutesShort(m);
}
