const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MEGABYTE = 1_000_000;

function comma(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/**
 * A duration the eye can compare at a glance.
 *
 * Under a minute it stays in seconds with one decimal, because that is where
 * the difference between two steps shows; past that, the decimal is noise and
 * the minutes are what the reader is waiting on.
 */
export function humanMs(ms: number): string {
  if (ms < MINUTE_MS) {
    return `${comma(ms / SECOND_MS)} s`;
  }

  if (ms < HOUR_MS) {
    const minutes = Math.floor(ms / MINUTE_MS);

    return `${minutes} min ${Math.round((ms - minutes * MINUTE_MS) / SECOND_MS)} s`;
  }

  const hours = Math.floor(ms / HOUR_MS);

  return `${hours} h ${Math.round((ms - hours * HOUR_MS) / MINUTE_MS)} min`;
}

export function humanBytes(bytes: number): string {
  return `${comma(bytes / MEGABYTE)} Mo`;
}
