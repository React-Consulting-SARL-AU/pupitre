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

const WEEKS_FROM_DAYS = 28;

export function choiceOf(interval: number): IntervalChoice {
  const named = String(interval) as IntervalChoice;

  return BACKUP_INTERVAL_CHOICES.includes(named) ? named : "custom";
}

/** Shorter intervals run from the previous backup, not at the configured hour. */
export function startsAtHour(interval: number): boolean {
  return interval >= HOURS_PER_DAY;
}

export interface Span {
  unit: "hours" | "days" | "weeks";
  count: number;
}

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

export function numberOf(value: unknown, fallback: number): number {
  const read = typeof value === "string" ? Number(value) : value;

  return typeof read === "number" && Number.isFinite(read) ? read : fallback;
}
