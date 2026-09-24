/**
 * The schedule of `core.backup` in the reader's words: an interval picked
 * among the usual ones, and what a retention count amounts to in time.
 */

export const BACKUP_INTERVAL_CHOICES = [
  "1",
  "6",
  "12",
  "24",
  "168",
  "0",
  "custom",
] as const;

export type IntervalChoice = (typeof BACKUP_INTERVAL_CHOICES)[number];

const HOURS_PER_DAY = 24;

const DAYS_PER_WEEK = 7;

/** From this span on, history is counted in weeks rather than days. */
const WEEKS_FROM_DAYS = 28;

export function choiceOf(interval: number): IntervalChoice {
  const named = String(interval) as IntervalChoice;

  return BACKUP_INTERVAL_CHOICES.includes(named) ? named : "custom";
}

/** A backup a day or more apart starts at the configured hour; a shorter one runs from the last. */
export function startsAtHour(interval: number): boolean {
  return interval >= HOURS_PER_DAY;
}

export interface Span {
  unit: "hours" | "days" | "weeks";
  count: number;
}

/** How far back the backups kept reach, rounded to what a reader would say. */
export function historyOf(interval: number, keep: number): Span {
  const hours = interval * keep;

  if (hours < 2 * HOURS_PER_DAY) {
    return { count: hours, unit: "hours" };
  }

  const days = Math.round(hours / HOURS_PER_DAY);

  return days < WEEKS_FROM_DAYS
    ? { count: days, unit: "days" }
    : { count: Math.round(days / DAYS_PER_WEEK), unit: "weeks" };
}

/** A number a form holds, as the agent sent it or as it was typed. */
export function numberOf(value: unknown, fallback: number): number {
  const read = typeof value === "string" ? Number(value) : value;

  return typeof read === "number" && Number.isFinite(read) ? read : fallback;
}
